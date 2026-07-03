import { useRef, useEffect } from 'react'
import type { Tab, ThemeMode } from '../../types'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string
  onSwitch: (id: string) => void
  onClose: (id: string) => void
  onCreate: () => void
  theme: ThemeMode
  onToggleTheme: () => void
}

/**
 * TabBar — horizontal tab bar with new/close controls and theme toggle.
 *
 * - Scrollable tab list, active tab highlighted.
 * - Each tab has a close button (×), visible on hover.
 * - New tab button (+) at the end.
 * - Theme toggle button (🌙/☀️) at the right end.
 * - Auto-scrolls to keep the active tab visible.
 */
export function TabBar({ tabs, activeTabId, onSwitch, onClose, onCreate, theme, onToggleTheme }: TabBarProps) {
  const tabsRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)

  // Auto-scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [activeTabId])

  return (
    <div className="tab-bar">
      <div className="tab-bar-tabs" ref={tabsRef}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={tab.id === activeTabId ? activeTabRef : undefined}
            className={`tab-item ${tab.id === activeTabId ? 'tab-active' : ''}`}
            onClick={() => onSwitch(tab.id)}
          >
            <span className="tab-title">{tab.title}</span>
            <span
              className="tab-close"
              role="button"
              tabIndex={0}
              aria-label={`Close ${tab.title}`}
              title={`Close ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation()
                try {
                  onClose(tab.id)
                } catch (err) {
                  console.error('[TabBar] Failed to close tab:', err)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  try {
                    onClose(tab.id)
                  } catch (err) {
                    console.error('[TabBar] Failed to close tab:', err)
                  }
                }
              }}
            >
              ×
            </span>
          </button>
        ))}
        <button className="tab-new" onClick={onCreate} title="New tab">
          +
        </button>
      </div>
      <button
        className="theme-toggle-btn"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  )
}

export default TabBar
