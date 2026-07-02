import { useRef, useEffect } from 'react'
import type { Tab } from '../../types'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string
  onSwitch: (id: string) => void
  onClose: (id: string) => void
  onCreate: () => void
}

/**
 * TabBar — horizontal tab bar with new/close controls.
 *
 * - Scrollable tab list, active tab highlighted.
 * - Each tab has a close button (×), visible on hover.
 * - New tab button (+) at the end.
 * - Auto-scrolls to keep the active tab visible.
 */
export function TabBar({ tabs, activeTabId, onSwitch, onClose, onCreate }: TabBarProps) {
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
            {tabs.length > 1 && (
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                title="Close tab"
              >
                ×
              </span>
            )}
          </button>
        ))}
        <button className="tab-new" onClick={onCreate} title="New tab">
          +
        </button>
      </div>
    </div>
  )
}

export default TabBar
