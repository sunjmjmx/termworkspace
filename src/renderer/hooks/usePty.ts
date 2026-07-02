import { useEffect, useRef, useCallback } from 'react'

interface PtyCallbacks {
  onData: (data: string) => void
  onExit: (exitCode: number) => void
}

/**
 * usePty — manages the IPC lifecycle for one terminal PTY.
 *
 * - Creates the PTY in main process on mount
 * - Forwards keystrokes: write(data)
 * - Forwards resize: resize(cols, rows)
 * - Cleans up listeners on unmount
 */
export function usePty(terminalId: string, callbacks: PtyCallbacks) {
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

  // Create PTY on mount, clean up on unmount
  useEffect(() => {
    const api = window.electronAPI

    // Subscribe to output and exit events
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.on('terminal:output', onData as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.on('terminal:exit', onExit as any)

    // Spawn the PTY in main process
    api.send('terminal:create', terminalId)

    return () => {
      api.removeAllListeners('terminal:output')
      api.removeAllListeners('terminal:exit')
    }
  }, [terminalId, onData, onExit])

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
