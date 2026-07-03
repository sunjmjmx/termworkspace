import { spawn as nodePtySpawn } from 'node-pty';
import { spawn as cpSpawn, execSync } from 'child_process';
import os from 'os';

// ---------------------------------------------------------------------------
// Platform & architecture detection
// ---------------------------------------------------------------------------

export type Platform = 'macos' | 'windows' | 'linux';
export type Chip = 'arm64' | 'x64' | 'unknown';

/**
 * Returns the current OS platform in a canonical form.
 */
export function getPlatform(): Platform {
  const raw = os.platform();
  if (raw === 'darwin') return 'macos';
  if (raw === 'win32') return 'windows';
  return 'linux';
}

/**
 * Returns the CPU architecture of the running Node.js binary.
 */
export function getChip(): Chip {
  const arch = process.arch;
  if (arch === 'arm64') return 'arm64';
  if (arch === 'x64') return 'x64';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// OS-appropriate path helpers
// ---------------------------------------------------------------------------

/**
 * Returns the default interactive shell path for the current platform.
 *
 * macOS  -> /bin/zsh
 * Linux  -> /bin/bash
 * Windows -> cmd.exe (first candidate, then powershell.exe)
 */
export function getShell(): string {
  const plat = getPlatform();
  switch (plat) {
    case 'macos':
      return '/bin/zsh';
    case 'linux':
      return '/bin/bash';
    case 'windows':
      // Return a list – first cmd.exe; callers can split or iterate
      return 'C:\\Windows\\System32\\cmd.exe';
  }
}

/**
 * Alternative Windows shells, returned as an ordered array so callers can
 * try each in turn.
 */
export function getWindowsShells(): string[] {
  return [
    'C:\\Windows\\System32\\cmd.exe',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  ];
}

/**
 * Resolves the path to the Python 3 interpreter using the platform-native
 * command (`which` on Unix, `where` on Windows).
 *
 * Returns the raw path string on success, or the fallback `'python3'` if the
 * lookup fails or throws.
 */
export function getPythonPath(): string {
  const plat = getPlatform();
  try {
    if (plat === 'windows') {
      return execSync('where python3', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)[0];
    }
    return execSync('which python3', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'python3';
  }
}

// ---------------------------------------------------------------------------
// PtyProcess interface
// ---------------------------------------------------------------------------

export interface PtyProcess {
  /** Write data (e.g. user input) to the PTY. */
  write(data: string): void;

  /** Kill the underlying process. */
  kill(signal?: string): void;

  /** Resize the PTY dimensions. */
  resize(cols: number, rows: number): void;
}

// ---------------------------------------------------------------------------
// Callbacks for PTY output / lifecycle events
// ---------------------------------------------------------------------------

export interface PtyCallbacks {
  /** Called with output from the PTY. */
  onData?: (data: string) => void;
  /** Called when the process exits. */
  onExit?: (code: number | null, signal: string | null) => void;
  /** Called on an unrecoverable error. */
  onError?: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Embedded Python PTY bridge (Tier 2 on Unix)
// ---------------------------------------------------------------------------

const PYTHON_PTY_BRIDGE = `
import sys, os, pty, select, errno
shell = sys.argv[1]
pid, fd = pty.fork()
if pid == 0:
    basename = os.path.basename(shell)
    os.execvp(shell, ['-' + basename])
    sys.exit(1)
else:
    try:
        while True:
            r, w, x = select.select([sys.stdin, fd], [], [])
            if sys.stdin in r:
                try:
                    data = os.read(sys.stdin.fileno(), 65536)
                except OSError as e:
                    if e.errno != errno.EINTR: break
                    continue
                if not data: break
                os.write(fd, data)
            if fd in r:
                try:
                    data = os.read(fd, 65536)
                except OSError as e:
                    if e.errno != errno.EINTR: break
                    continue
                if not data: break
                os.write(sys.stdout.fileno(), data)
                sys.stdout.flush()
    except (EOFError, KeyboardInterrupt):
        pass
    finally:
        try: os.close(fd)
        except: pass
        try: os.waitpid(pid, 0)
        except: pass
`;

// ---------------------------------------------------------------------------
// PTY creation helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Attempt Tier 1: node-pty native spawn.
 *
 * Returns a PtyProcess wrapper on success, or `null` on failure (so the
 * caller can fall through to the next tier).
 */
function tryNodePty(
  shell: string,
  cwd: string | undefined,
  callbacks?: PtyCallbacks,
): PtyProcess | null {
  try {
    // Attempt a dynamic import / require of node-pty. If the native module
    // is missing, node-pty's import will throw synchronously at module load.
    const pty = nodePtySpawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd ?? process.env.HOME ?? os.homedir(),
      env: process.env as Record<string, string>,
    });

    if (callbacks?.onData) {
      pty.onData(callbacks.onData);
    }
    if (callbacks?.onExit) {
      pty.onExit((e: { exitCode: number; signal?: number }) => {
        callbacks.onExit?.(e.exitCode, e.signal !== undefined ? String(e.signal) : null);
      });
    }

    return {
      write: (data: string) => pty.write(data),
      kill: (signal?: string) => {
        try { pty.kill(signal); } catch { /* ignore */ }
      },
      resize: (cols: number, rows: number) => {
        try { pty.resize(cols, rows); } catch { /* ignore */ }
      },
    };
  } catch (err) {
    callbacks?.onError?.(
      err instanceof Error ? err : new Error(String(err)),
    );
    return null;
  }
}

/**
 * Attempt Tier 2 (Unix only): Python PTY bridge via pty.fork().
 *
 * Spawns the embedded Python script which creates its own PTY and runs the
 * shell inside it.  Communication happens over the child process's piped
 * stdin / stdout.
 */
function tryPythonPtyBridge(
  shell: string,
  cwd: string | undefined,
  callbacks?: PtyCallbacks,
): PtyProcess | null {
  const python = getPythonPath();

  try {
    const child = cpSpawn(python, ['-c', PYTHON_PTY_BRIDGE, shell], {
      cwd: cwd ?? process.env.HOME ?? os.homedir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    // Relay errors from the bridge process so callers can react
    child.on('error', (err) => {
      callbacks?.onError?.(err);
    });

    child.on('exit', (code, sig) => {
      callbacks?.onExit?.(code, sig);
    });

    if (callbacks?.onData && child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        callbacks.onData!(chunk.toString('utf-8'));
      });
    }

    // Forward stderr as data as well (some shells emit there)
    if (callbacks?.onData && child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        callbacks.onData!(chunk.toString('utf-8'));
      });
    }

    return {
      write: (data: string) => {
        if (child.stdin?.writable) {
          child.stdin.write(data);
        }
      },
      kill: (signal?: string) => {
        try { child.kill((signal ?? 'SIGTERM') as NodeJS.Signals); } catch { /* ignore */ }
      },
      resize: (_cols: number, _rows: number) => {
        // Python PTY bridge does not support live resize via this simple
        // script – silently ignored.
      },
    };
  } catch (err) {
    callbacks?.onError?.(
      err instanceof Error ? err : new Error(String(err)),
    );
    return null;
  }
}

/**
 * Attempt Tier 3 (fallback): raw child_process.spawn.
 *
 * No PTY is involved – the shell runs on a regular pipe.  Some interactive
 * programs may behave differently (no SIGWINCH, no job control).
 */
function tryRawSpawn(
  shell: string,
  cwd: string | undefined,
  callbacks?: PtyCallbacks,
): PtyProcess {
  const child = cpSpawn(shell, [], {
    cwd: cwd ?? process.env.HOME ?? os.homedir(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });

  child.on('error', (err) => {
    callbacks?.onError?.(err);
  });

  child.on('exit', (code, sig) => {
    callbacks?.onExit?.(code, sig);
  });

  if (callbacks?.onData && child.stdout) {
    child.stdout.on('data', (chunk: Buffer) => {
      callbacks.onData!(chunk.toString('utf-8'));
    });
  }

  if (callbacks?.onData && child.stderr) {
    child.stderr.on('data', (chunk: Buffer) => {
      callbacks.onData!(chunk.toString('utf-8'));
    });
  }

  return {
    write: (data: string) => {
      if (child.stdin?.writable) {
        child.stdin.write(data);
      }
    },
    kill: (signal?: string) => {
      try { child.kill((signal ?? 'SIGTERM') as NodeJS.Signals); } catch { /* ignore */ }
    },
    resize: (_cols: number, _rows: number) => {
      // Raw spawn has no PTY → no resize.
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a PTY (pseudo-terminal) for the given terminal identifier, using a
 * 3-tier fallback strategy:
 *
 * 1. **node-pty** native spawn (best fidelity — full PTY, resize support).
 * 2. **Python PTY bridge** (Unix only – pty.fork() via an embedded Python
 *    script).  Good fidelity, no resize.
 * 3. **Raw child_process.spawn** (pipe-based fallback — no PTY at all).
 *
 * On Windows the fallback skips tier 2 (no Python PTY bridge) and goes
 * directly to raw spawn.
 *
 * @param terminalId  Logical identifier for the terminal session (logged but
 *                    not used functionally).
 * @param cwd         Working directory for the spawned process.
 * @param callbacks   Lifecycle / data callbacks.
 */
export function createPTY(
  terminalId: string,
  cwd?: string,
  callbacks?: PtyCallbacks,
): PtyProcess {
  const plat = getPlatform();
  const shell = (plat === 'windows' ? getWindowsShells()[0] : getShell());
  const _tag = terminalId; // kept for future diagnostic use

  // --- Tier 1: node-pty ---------------------------------------------------
  const nodePtyResult = tryNodePty(shell, cwd, callbacks);
  if (nodePtyResult !== null) return nodePtyResult;

  // --- Tier 2: Python PTY bridge (Unix only) ------------------------------
  if (plat !== 'windows') {
    const pythonPtyResult = tryPythonPtyBridge(shell, cwd, callbacks);
    if (pythonPtyResult !== null) return pythonPtyResult;
  }

  // --- Tier 3: raw spawn (always works) -----------------------------------
  return tryRawSpawn(shell, cwd, callbacks);
}
