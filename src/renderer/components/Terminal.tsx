import { useEffect, useRef } from 'react'
import { Terminal as XtermTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { usePty } from '../hooks/usePty'
import type { ThemeMode } from '../../types'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  terminalId: string
  theme: ThemeMode
  projectPath?: string
}

const DARK_THEME = {
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
}

const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#4a90d9',
  selectionBackground: '#c8daf0',
  black: '#e8e8e8',
  red: '#e74c3c',
  green: '#5cb85c',
  yellow: '#f0ad4e',
  blue: '#4a90d9',
  magenta: '#9b59b6',
  cyan: '#1abc9c',
  white: '#d0d0d0',
  brightBlack: '#cccccc',
  brightRed: '#e74c3c',
  brightGreen: '#5cb85c',
  brightYellow: '#f0ad4e',
  brightBlue: '#4a90d9',
  brightMagenta: '#9b59b6',
  brightCyan: '#1abc9c',
  brightWhite: '#e0e0e0',
}

/**
 * Terminal — wraps xterm.js into a React component with theme support.
 *
 * - Creates an XtermTerminal instance on mount.
 * - Re-themes (without full re-creation) when `theme` prop changes.
 * - Connects to the main-process PTY via the usePty IPC hook.
 * - Auto-sizes itself to fill its container (FitAddon).
 */
export function Terminal({ terminalId, theme, projectPath }: TerminalProps) {
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
  }, projectPath)

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
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
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

  // ── Theme update ─────────────────────────────────────────
  // xterm.js doesn't support full theme hot-swap, so we update
  // the theme options and force a re-render via the options setter.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME
  }, [theme])

  return (
    <div
      ref={containerRef}
      className="terminal-container"
    />
  )
}

export default Terminal
