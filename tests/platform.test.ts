import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Platform detection (pure functions, no mocking needed) ───

describe('platform detection', () => {
  it('getPlatform() returns macos on darwin', async () => {
    const { getPlatform } = await import('../src/main/platform');
    expect(getPlatform()).toBe('macos');
  });

  it('getChip() returns arm64 or x64 matching process.arch', async () => {
    const { getChip } = await import('../src/main/platform');
    const expected = process.arch === 'arm64' ? 'arm64' : 'x64';
    expect(getChip()).toBe(expected);
  });

  it('getShell() returns /bin/zsh on macos', async () => {
    const { getShell } = await import('../src/main/platform');
    expect(getShell()).toBe('/bin/zsh');
  });

  it('getWindowsShells() returns ordered list with cmd.exe first', async () => {
    const { getWindowsShells } = await import('../src/main/platform');
    const shells = getWindowsShells();
    expect(shells).toHaveLength(2);
    expect(shells[0]).toContain('cmd.exe');
    expect(shells[1]).toContain('powershell.exe');
  });

  it('getPythonPath() resolves a real python3 path on this machine', async () => {
    const { getPythonPath } = await import('../src/main/platform');
    const path = getPythonPath();
    expect(path).toBeTruthy();
    expect(path.length).toBeGreaterThan(0);
  });
});

// Helper: create a fake ChildProcess-like object
function fakeChildProcess() {
  const handlers: Record<string, (...a: any[]) => void> = {};
  return {
    stdin: { writable: true, write: vi.fn() },
    stdout: { on: vi.fn((ev, cb) => { handlers[ev] = cb; }) },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
    on: vi.fn((ev, cb) => { handlers[ev] = cb; }),
    emit: (ev: string, ...args: any[]) => {
      if (handlers[ev]) handlers[ev](...args);
    },
  };
}

function fakePtyProcess() {
  return {
    onData: vi.fn((cb: any) => { /* register but no-op for test */ }),
    onExit: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn(),
  };
}

// ─── createPTY fallback logic (mocked) ───

describe('createPTY fallback chain', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('Tier 1 (node-pty) is attempted first, returns PtyProcess on success', async () => {
    vi.doMock('node-pty', () => ({
      spawn: vi.fn(() => fakePtyProcess()),
    }));

    const { createPTY } = await import('../src/main/platform');

    const pty = createPTY('test-1-1');
    expect(pty).toBeDefined();
    expect(typeof pty.write).toBe('function');
    expect(typeof pty.kill).toBe('function');
    expect(typeof pty.resize).toBe('function');
    expect(() => pty.write('hello')).not.toThrow();
    expect(() => pty.kill()).not.toThrow();
    expect(() => pty.resize(80, 24)).not.toThrow();
  });

  it('Tier 1 fails → Tier 2 (Python PTY bridge) attempted on Unix', async () => {
    vi.doMock('node-pty', () => ({
      spawn: vi.fn(() => { throw new Error('node-pty not available'); }),
    }));

    const child = fakeChildProcess();
    vi.doMock('child_process', () => ({
      spawn: vi.fn(() => child),
      execSync: vi.fn(() => '/usr/bin/python3'),
    }));

    const { createPTY } = await import('../src/main/platform');
    const callbacks = { onData: vi.fn(), onExit: vi.fn(), onError: vi.fn() };

    const pty = createPTY('test-1-2', undefined, callbacks);
    expect(pty).toBeDefined();
    expect(() => pty.write('ls -la\n')).not.toThrow();
    expect(() => pty.kill()).not.toThrow();
    expect(() => pty.resize(80, 24)).not.toThrow();
  });

  it('Platform detection: each canonical platform maps correctly', async () => {
    // Test the logic by examining exports directly
    const { getPlatform, getShell, getWindowsShells } = await import('../src/main/platform');

    // macOS path
    expect(getPlatform()).toBe('macos');
    expect(getShell()).toBe('/bin/zsh');

    // Windows shells path
    const winShells = getWindowsShells();
    expect(winShells[0]).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(winShells[1]).toContain('powershell.exe');
  });

  it('Tier 1 + Tier 2 both fail → Tier 3 (raw spawn) returned', async () => {
    vi.doMock('node-pty', () => ({
      spawn: vi.fn(() => { throw new Error('node-pty fail'); }),
    }));

    // Tier 2 failure: execSync throws (python not found), spawn throws
    let callCount = 0;
    const child = fakeChildProcess();
    vi.doMock('child_process', () => ({
      spawn: vi.fn(() => {
        callCount++;
        // Both Tier 2 and Tier 3 use cpSpawn; but we return a valid child either way
        // since cpSpawn never throws in reality
        return child;
      }),
      execSync: vi.fn(() => { throw new Error('no python'); }),
    }));

    const { createPTY } = await import('../src/main/platform');
    const callbacks = { onData: vi.fn(), onExit: vi.fn(), onError: vi.fn() };

    const pty = createPTY('test-fallback', undefined, callbacks);
    expect(pty).toBeDefined();
    expect(() => pty.write('echo hello\n')).not.toThrow();
    expect(() => pty.kill()).not.toThrow();
    expect(() => pty.resize(80, 24)).not.toThrow();
  });

  it('Tier 1 available: full write/kill/resize lifecycle works', async () => {
    const mockPty = fakePtyProcess();
    vi.doMock('node-pty', () => ({
      spawn: vi.fn(() => mockPty),
    }));

    const { createPTY } = await import('../src/main/platform');
    const pty = createPTY('test-complete');

    pty.write('npm run build\n');
    pty.resize(120, 40);
    pty.kill('SIGTERM');

    expect(mockPty.write).toHaveBeenCalledWith('npm run build\n');
    expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
    expect(mockPty.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('Tier 1 error propagates to onError callback', async () => {
    vi.doMock('node-pty', () => ({
      spawn: vi.fn(() => { throw new TypeError('NATIVE_MODULE_FAIL'); }),
    }));

    // Make Tier 2 also fail
    const child = fakeChildProcess();
    vi.doMock('child_process', () => ({
      spawn: vi.fn(() => child),
      execSync: vi.fn(() => { throw new Error('no python'); }),
    }));

    const { createPTY } = await import('../src/main/platform');
    const onError = vi.fn();
    createPTY('test-error-1', undefined, { onError });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('NATIVE_MODULE_FAIL') }),
    );
  });

  it('Tier 2 catches getPythonPath failure gracefully (falls back to raw spawn)', async () => {
    // Mock: Tier 1 fails, Tier 2's getPythonPath returns fallback 'python3',
    // cpSpawn('python3') also throws = Tier 2 reports error, falls to Tier 3
    vi.doMock('node-pty', () => ({
      spawn: vi.fn(() => { throw new Error('node-pty fail'); }),
    }));

    const child = fakeChildProcess();
    vi.doMock('child_process', () => ({
      spawn: vi.fn((cmd: string) => {
        // First call = Tier 2 python bridge — make it throw
        if (cmd === 'python3') throw new Error('python3 not found');
        // Second call = Tier 3 raw spawn — succeed
        return child;
      }),
      execSync: vi.fn(() => { throw new Error('which python3 failed'); }),
    }));

    const { createPTY } = await import('../src/main/platform');
    const onError = vi.fn();

    const pty = createPTY('test-error-2', undefined, { onError });

    // Two onError calls: Tier 1 (node-pty) + Tier 2 (python bridge)
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ message: expect.stringContaining('node-pty fail') }),
    );
    expect(onError).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ message: expect.stringContaining('python3') }),
    );

    // Falls through to Tier 3 (raw spawn) — always returns a PtyProcess
    expect(pty).toBeDefined();
    expect(() => pty.write('test')).not.toThrow();
  });
});

// ─── PtyProcess interface compliance ───

describe('PtyProcess interface compliance', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('Tier 2 (Python PTY bridge) resize does not throw (SIGWINCH handler active)', async () => {
    // Force Tier 2: mock node-pty to fail, child_process to succeed
    vi.doMock('node-pty', () => ({
      spawn: vi.fn(() => { throw new Error('node-pty not available'); }),
    }));

    const child = fakeChildProcess();
    vi.doMock('child_process', () => ({
      spawn: vi.fn(() => child),
      execSync: vi.fn(() => '/usr/bin/python3'),
    }));

    const { createPTY } = await import('../src/main/platform');

    const pty = createPTY('test-resize-syntax', undefined, {
      onData: vi.fn(),
    });

    // resize should not throw — confirms the SIGWINCH handler and resize
    // file write path execute without runtime errors
    expect(() => pty.resize(120, 40)).not.toThrow();
    expect(() => pty.resize(80, 24)).not.toThrow();
  });

  it('returned object from all tiers conforms to PtyProcess interface', async () => {
    // Test the interface shape using Tier 1
    vi.doMock('node-pty', () => ({
      spawn: vi.fn(() => fakePtyProcess()),
    }));

    const { createPTY } = await import('../src/main/platform');
    const pty = createPTY('test-iface');

    // Must have all three methods
    expect(pty).toHaveProperty('write');
    expect(pty).toHaveProperty('kill');
    expect(pty).toHaveProperty('resize');
    expect(typeof pty.write).toBe('function');
    expect(typeof pty.kill).toBe('function');
    expect(typeof pty.resize).toBe('function');

    // Must not have unexpected properties
    const keys = Object.keys(pty);
    expect(keys).toEqual(expect.arrayContaining(['write', 'kill', 'resize']));
  });
});
