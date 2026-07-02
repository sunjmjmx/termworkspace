import { useEffect, useRef, useCallback } from 'react'

interface PtyCallbacks {
  onData: (data: string) => void
  onExit: (exitCode: number) => void
  onError?: (error: string) => void
}

/**
 * usePty — manages the IPC lifecycle for one terminal PTY.
 *
 * - Creates the PTY in main process on mount (optionally with cwd)
 * - Forwards keystrokes: write(data)
 * - Forwards resize: resize(cols, rows)
 * - Cleans up listeners on unmount
 */
export function usePty(terminalId: string, callbacks: PtyCallbacks, cwd?: string) {
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  // Data callback — stable reference
  const onData = useCallback((_terminalId: string, data: string) => {
    if (_terminalId === terminalId) {
      callbacksRef.current.onData(data)
    }
  }, [terminalId])

  // Exit callback — stable reference
  const onExit = useCallback((_terminalId: string, exitCode: number) => {
    if (_terminalId === terminalId) {
      callbacksRef.current.onExit(exitCode)
    }
  }, [terminalId])

  // Error callback — stable reference
  const onError = useCallback((_terminalId: string, error: string) => {
    if (_terminalId === terminalId) {
      callbacksRef.current.onError?.(error)
    }
  }, [terminalId])

  // Create PTY on mount, clean up on unmount
  useEffect(() => {
    const api = window.electronAPI

    // Subscribe to output and exit events
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.on('terminal:output', onData as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.on('terminal:exit', onExit as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.on('terminal:error', onError as any)

    // Spawn the PTY in main process — pass cwd if provided
    if (cwd) {
      api.send('terminal:create', terminalId, cwd)
    } else {
      api.send('terminal:create', terminalId)
    }

    return () => {
      api.send('terminal:kill', terminalId)
      api.removeAllListeners('terminal:output')
      api.removeAllListeners('terminal:exit')
      api.removeAllListeners('terminal:error')
    }
  }, [terminalId, onData, onExit, onError, cwd])

  // Write keystrokes to PTY
  const write = useCallback((data: string) => {
    window.electronAPI.send('terminal:write', terminalId, data)
  }, [terminalId])

  // Resize PTY dimensions
  const resize = useCallback((cols: number, rows: number) => {
    window.electronAPI.send('terminal:resize', terminalId, cols, rows)
  }, [terminalId])

  return { write, resize }
}
