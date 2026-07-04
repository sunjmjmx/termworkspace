import { useState, useCallback, useEffect } from 'react'
import { Terminal } from './Terminal'
import { AIChat } from './AIChat'
import type { ThemeMode } from '../../types'

type CellMode = 'terminal' | 'ai'

interface CellProps {
  leafId: string
  theme: ThemeMode
  projectPath?: string
}

/**
 * Cell — a grid cell that can display either a Terminal or an AI Chat.
 *
 * - Always-visible mode switch button (terminal ↔ ai).
 * - Escape key closes AI panel when in AI mode.
 * - AIChat receives an onClose callback for its own close button.
 * - Both components stay mounted (CSS display toggle) to preserve state.
 */
export function Cell({ leafId, theme, projectPath }: CellProps) {
  const [mode, setMode] = useState<CellMode>('terminal')

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'terminal' ? 'ai' : 'terminal'))
  }, [])

  const closeAIChat = useCallback(() => {
    setMode('terminal')
  }, [])

  // Escape key closes AI chat when in AI mode
  useEffect(() => {
    if (mode !== 'ai') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAIChat()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, closeAIChat])

  return (
    <div className="cell">
      {/* Terminal layer */}
      <div
        className="cell-layer"
        style={{ display: mode === 'terminal' ? 'flex' : 'none' }}
      >
        <Terminal terminalId={`${leafId}_term`} theme={theme} projectPath={projectPath} />
      </div>

      {/* AI Chat layer */}
      <div
        className="cell-layer"
        style={{ display: mode === 'ai' ? 'flex' : 'none' }}
      >
        <AIChat chatId={`${leafId}_ai`} onClose={closeAIChat} />
      </div>

      {/* Mode switch button (always visible) */}
      <button
        className="cell-mode-btn"
        onClick={toggleMode}
        title={mode === 'terminal' ? 'Open AI chat' : 'Close AI panel'}
      >
        {mode === 'terminal' ? '🤖' : '✕'}
      </button>
    </div>
  )
}

export default Cell
