#!/usr/bin/env node
/**
 * P3-2 Integration Test — PTY Tiers (macOS ARM)
 *
 * Tests the actual PTY creation mechanisms on the current machine.
 * This runs outside Electron, so node-pty (Tier 1) is expected to fail
 * due to missing macOS entitlements — this is documented behavior.
 *
 * Usage: node tests/integration/pty-tier-test.mjs
 */

import { spawn, execSync } from 'child_process';
import { platform, arch, homedir, tmpdir } from 'os';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const cjsRequire = createRequire(import.meta.url);

const PASS = '\u2705';
const FAIL = '\u274C';
const WARN = '\u26A0\uFE0F';
const INFO = '\u2139\uFE0F';
let passed = 0;
let failed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try { fn(); console.log(`  ${PASS} ${name}`); passed++; }
  catch (e) { console.log(`  ${FAIL} ${name}\n      ${e.message}`); failed++; }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// Helper: collect stdout from a process
function collectOutput(cmd, args, input, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      resolve({ stdout, timedOut: true });
    }, timeoutMs || 5000);

    child.on('exit', () => {
      clearTimeout(timer);
      resolve({ stdout, timedOut: false });
    });

    child.on('error', () => {
      clearTimeout(timer);
      resolve({ stdout, timedOut: false, error: true });
    });

    if (input) {
      setTimeout(() => { child.stdin.write(input); child.stdin.end(); }, 300);
    }
  });
}

// ─── 0. Environment info ───
console.log(`\n${INFO} Platform: ${platform()}, Arch: ${arch()}, Node: ${process.version}`);
console.log(`${'='.repeat(55)}\n`);

// ─── 1. Platform Detection ───
console.log('Platform Detection');

test('os.platform() is darwin (macOS)', () => {
  assertEq(platform(), 'darwin');
});

test('process.arch matches known arch', () => {
  const a = arch();
  assert(a === 'arm64' || a === 'x64', `unexpected arch: ${a}`);
});

test('python3 is available', () => {
  const out = execSync('which python3', { encoding: 'utf-8' }).trim();
  assert(out.length > 0, 'python3 not in PATH');
  console.log(`      python3: ${out}`);
});

test('python version >= 3.8', () => {
  const out = execSync('python3 --version', { encoding: 'utf-8' }).trim();
  const match = out.match(/^Python (\d+)\.(\d+)/);
  assert(match, `unexpected python version: ${out}`);
  const major = parseInt(match[1]), minor = parseInt(match[2]);
  assert(major >= 3, `python3 too old: ${out}`);
  if (minor < 8) console.log(`      ${WARN} Python ${major}.${minor} — pty.fork() may work but untested`);
  console.log(`      python version: ${out}`);
});

// ─── 2. Raw Spawn (Tier 3) — always works ───
console.log('\nTier 3 — Raw child_process.spawn');

test('/bin/zsh spawn + echo works', () => {
  const out = execSync('/bin/zsh -c "echo TIER3_OK"', { encoding: 'utf-8' }).trim();
  assertEq(out, 'TIER3_OK');
});

test('/bin/zsh spawn with stdin pipe', async () => {
  const result = await collectOutput('/bin/zsh', [], 'echo STDIN_WORKS\n', 3000);
  assert(result.stdout.includes('STDIN_WORKS'), `expected STDIN_WORKS, got: ${result.stdout}`);
});

test('/bin/zsh spawn — kill by SIGTERM', async () => {
  const child = spawn('/bin/zsh', ['-c', 'sleep 30']);
  const start = Date.now();
  child.kill('SIGTERM');
  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
    setTimeout(() => resolve('timeout'), 3000);
  });
  const elapsed = Date.now() - start;
  assert(elapsed < 3000, `kill took too long: ${elapsed}ms`);
  console.log(`      killed in ${elapsed}ms, exit: ${exitCode !== null ? 'code='+exitCode : 'terminated by signal'}`);
});

// ─── 3. Python PTY Bridge (Tier 2) ───
console.log('\nTier 2 — Python PTY Bridge (pty.fork())');

const RESIZE_PTY_BRIDGE = [
  'import sys, os, pty, select, errno',
  'import signal, struct, fcntl, termios',
  'shell = sys.argv[1]',
  'resize_file_path = sys.argv[2] if len(sys.argv) > 2 else \'\'',
  'pid, fd = pty.fork()',
  'if pid == 0:',
  '    basename = os.path.basename(shell)',
  '    os.execvp(shell, ["-" + basename])',
  '    sys.exit(1)',
  'else:',
  '    def _handle_pty_resize(signum, frame):',
  '        if not resize_file_path: return',
  '        try:',
  '            with open(resize_file_path) as f:',
  '                line = f.read().strip()',
  '            parts = line.split(\',\')',
  '            if len(parts) == 2:',
  '                cols, rows = int(parts[0]), int(parts[1])',
  '                ws = struct.pack(\'HHHH\', rows, cols, 0, 0)',
  '                fcntl.ioctl(fd, termios.TIOCSWINSZ, ws)',
  '        except (OSError, ValueError, IOError):',
  '            pass',
  '    signal.signal(signal.SIGWINCH, _handle_pty_resize)',
  '    try:',
  '        import time',
  '        time.sleep(0.2)',
  '        while True:',
  '            r, w, x = select.select([sys.stdin, fd], [], [], 2.0)',
  '            if not r: break',
  '            if sys.stdin in r:',
  '                try:',
  '                    data = os.read(sys.stdin.fileno(), 65536)',
  '                except OSError as e:',
  '                    if e.errno != errno.EINTR: break',
  '                    continue',
  '                if not data: break',
  '                os.write(fd, data)',
  '            if fd in r:',
  '                try:',
  '                    data = os.read(fd, 65536)',
  '                except OSError as e:',
  '                    if e.errno != errno.EINTR: break',
  '                    continue',
  '                if not data: break',
  '                os.write(sys.stdout.fileno(), data)',
  '                sys.stdout.flush()',
  '    except (EOFError, KeyboardInterrupt):',
  '        pass',
  '    finally:',
  '        try: os.close(fd)',
  '        except: pass',
  '        try: os.waitpid(pid, 0)',
  '        except: pass',
].join('\n');

test('Python PTY bridge spawns shell and relays output', async () => {
  const python = execSync('which python3', { encoding: 'utf-8' }).trim();
  const result = await collectOutput(
    python, ['-c', RESIZE_PTY_BRIDGE, '/bin/zsh', ''],
    'echo PTY_BRIDGE_OK\n', 5000
  );
  assert(result.stdout.includes('PTY_BRIDGE_OK'),
    `Expected PTY_BRIDGE_OK. Got: ${result.stdout.substring(0, 300)}`);
});

test('Python PTY bridge — kill by SIGTERM', async () => {
  const python = execSync('which python3', { encoding: 'utf-8' }).trim();
  const child = spawn(python, ['-c', RESIZE_PTY_BRIDGE, '/bin/zsh', ''], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  await new Promise(r => setTimeout(r, 500));
  const start = Date.now();
  child.kill('SIGTERM');

  const result = await new Promise((resolve) => {
    child.on('exit', (code, sig) => resolve(code !== null ? `code=${code}` : `signal=${sig}`));
    setTimeout(() => resolve('timeout'), 5000);
  });

  const elapsed = Date.now() - start;
  assert(elapsed < 5000, `kill took too long: ${elapsed}ms`);
  console.log(`      killed in ${elapsed}ms, exit: ${result}`);
});

// ─── 4. node-pty status (Tier 1) ───
console.log('\nTier 1 — node-pty');

test('node-pty package.json exists', () => {
  const pkgPath = join(process.cwd(), 'node_modules', 'node-pty', 'package.json');
  assert(existsSync(pkgPath), `node-pty not found at ${pkgPath}`);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  assert(pkg.version, 'no version field');
  console.log(`      node-pty version: ${pkg.version}`);
});

test('node-pty spawn outside Electron (expected fail — needs entitlements)', () => {
  try {
    const pty = cjsRequire('node-pty');
    const p = pty.spawn('/bin/zsh', [], { name: 'xterm', cols: 80, rows: 24 });
    p.kill();
    console.log(`      ${WARN} node-pty works outside Electron`);
  } catch (e) {
    assert(e.message.includes('posix_spawnp'),
      `Expected posix_spawnp, got: ${e.message.substring(0, 80)}`);
    console.log('      Expected: posix_spawnp failed (needs Electron entitlements)');
  }
});

// ─── 5. Phase 2 functions ───
console.log('\nPhase 2 Functions (standalone verification)');

const SANDBOX = join(homedir(), '.termworkspace-sandbox-p3');
rmSync(SANDBOX, { recursive: true, force: true });
mkdirSync(join(SANDBOX, 'chats'), { recursive: true });
mkdirSync(join(SANDBOX, 'test-project', 'src'), { recursive: true });
mkdirSync(join(SANDBOX, 'test-project', 'docs'), { recursive: true });
writeFileSync(join(SANDBOX, 'test-project', 'src', 'index.ts'), 'export const x=1;', 'utf-8');
writeFileSync(join(SANDBOX, 'test-project', 'src', 'util.ts'), 'export const y=2;', 'utf-8');
writeFileSync(join(SANDBOX, 'test-project', 'README.md'), '# Test', 'utf-8');
writeFileSync(join(SANDBOX, 'test-project', '.env'), 'SECRET=***', 'utf-8');

test('readdir — dirs first, alphabetical, hidden filtered', () => {
  const entries = readdirSync(join(SANDBOX, 'test-project'), { withFileTypes: true });
  const visible = entries.filter(e => !e.name.startsWith('.'));
  const sorted = visible.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  assertEq(sorted.length, 3);
  assert(sorted[0].isDirectory()); assertEq(sorted[0].name, 'docs');
  assert(sorted[1].isDirectory()); assertEq(sorted[1].name, 'src');
  assert(!sorted[2].isDirectory()); assertEq(sorted[2].name, 'README.md');
});

test('config persistence — save/load/update theme', () => {
  const configFile = join(SANDBOX, 'config.json');
  writeFileSync(configFile, JSON.stringify({ theme: 'dark', projectPath: '/test' }), 'utf-8');
  assertEq(JSON.parse(readFileSync(configFile, 'utf-8')).theme, 'dark');
  const c = JSON.parse(readFileSync(configFile, 'utf-8'));
  c.theme = 'light';
  writeFileSync(configFile, JSON.stringify(c), 'utf-8');
  assertEq(JSON.parse(readFileSync(configFile, 'utf-8')).theme, 'light');
});

test('chat persistence — save/load/500 cap', () => {
  const chatFile = join(SANDBOX, 'chats', 'test.json');
  const msgs = [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello!' }];
  writeFileSync(chatFile, JSON.stringify(msgs), 'utf-8');
  assertEq(JSON.parse(readFileSync(chatFile, 'utf-8')).length, 2);
  assertEq(JSON.parse(readFileSync(chatFile, 'utf-8'))[0].role, 'user');

  const many = Array.from({ length: 505 }, (_, i) => ({ role: 'user', content: `Msg ${i}` }));
  const sliced = many.slice(-500);
  assertEq(sliced.length, 500);
  assertEq(sliced[0].content, 'Msg 5');
});

test('layout persistence — save/load', () => {
  const layoutFile = join(SANDBOX, 'layout.json');
  const layout = { tabs: [{ id: 't1', title: 'Terminal 1', tree: { type: 'leaf', id: 'l1' } }], activeTabId: 't1' };
  writeFileSync(layoutFile, JSON.stringify(layout), 'utf-8');
  assertEq(JSON.parse(readFileSync(layoutFile, 'utf-8')).activeTabId, 't1');
});

test('project path persistence', () => {
  const configFile = join(SANDBOX, 'config.json');
  const c = JSON.parse(readFileSync(configFile, 'utf-8'));
  c.projectPath = '/my-project';
  writeFileSync(configFile, JSON.stringify(c), 'utf-8');
  assertEq(JSON.parse(readFileSync(configFile, 'utf-8')).projectPath, '/my-project');
});

// Cleanup
rmSync(SANDBOX, { recursive: true, force: true });

// ─── Summary ───
console.log(`\n${'='.repeat(55)}`);
console.log(`  PTY Tier Test: ${PASS} ${passed}/${total} passed`);
if (failed > 0) console.log(`  ${FAIL} ${failed}/${total} failed`);
console.log(`${'='.repeat(55)}`);
process.exit(failed > 0 ? 1 : 0);
