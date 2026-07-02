import { useEffect, useRef } from 'react'
import { Terminal as XtermTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { usePty } from '../hooks/usePty'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  terminalId: string
}

/**
 * Terminal — wraps xterm.js into a React component.
 *
 * - Creates an XtermTerminal instance on mount with Catppuccin Mocha-like
 *   dark theme.
 * - Connects to the main-process PTY via the usePty IPC hook.
 * - Auto-sizes itself to fill its container (FitAddon).
 */
export function Terminal({ terminalId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XtermTerminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const { write, resize } = usePty(terminalId, {
    onData: (data) => {
      termRef.current?.write(data)
    },
    onExit: (_exitCode) => {
      termRef.current?.write('\r\n\x1b[31m[process exited]\x1b[0m')
    },
  })

  // ── Bootstrap xterm.js ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const term = new XtermTerminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
      lineHeight: 1.2,
      allowProposedApi: true,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#585b70',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#cba6f7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#cba6f7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(containerRef.current)
    fitAddonRef.current = fitAddon

    // Fit terminal after opening (need a tick for layout)
    requestAnimationFrame(() => {
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims) {
        resize(dims.cols, dims.rows)
      }
    })

    // Handle resize: fit the terminal then send new dimensions to PTY
    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          resize(dims.cols, dims.rows)
        }
      } catch {
        // silently ignore if terminal was destroyed
      }
    })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }
    resizeObserverRef.current = observer

    // Forward keystrokes to PTY
    term.onData((data: string) => {
      write(data)
    })

    termRef.current = term

    return () => {
      observer.disconnect()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      resizeObserverRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="terminal-container"
    />
  )
}

export default Terminal
