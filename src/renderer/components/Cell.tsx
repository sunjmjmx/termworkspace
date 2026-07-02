import { useState, useCallback } from 'react'
import { Terminal } from './Terminal'
import { AIChat } from './AIChat'
import type { ThemeMode } from '../../types'

type CellMode = 'terminal' | 'ai'

interface CellProps {
  leafId: string
  theme: ThemeMode
}

/**
 * Cell — a grid cell that can display either a Terminal or an AI Chat.
 *
 * - Hover reveals a mode switch button (terminal ↔ ai).
 * - Both components stay mounted (CSS display toggle) to preserve state.
 */
export function Cell({ leafId, theme }: CellProps) {
  const [mode, setMode] = useState<CellMode>('terminal')

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'terminal' ? 'ai' : 'terminal'))
  }, [])

  return (
    <div className="cell">
      {/* Terminal layer */}
      <div
        className="cell-layer"
        style={{ display: mode === 'terminal' ? 'flex' : 'none' }}
      >
        <Terminal terminalId={`${leafId}_term`} theme={theme} />
      </div>

      {/* AI Chat layer */}
      <div
        className="cell-layer"
        style={{ display: mode === 'ai' ? 'flex' : 'none' }}
      >
        <AIChat chatId={`${leafId}_ai`} />
      </div>

      {/* Mode switch button (hover reveal) */}
      <button
        className="cell-mode-btn"
        onClick={toggleMode}
        title={mode === 'terminal' ? 'Switch to AI mode' : 'Switch to Terminal mode'}
      >
        {mode === 'terminal' ? '🤖' : '▸'}
      </button>
    </div>
  )
}

export default Cell
