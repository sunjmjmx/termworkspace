import React, { useState, useEffect, useCallback } from 'react'
import { SplitPane } from './components/SplitPane'
import { TabBar } from './components/TabBar'
import { useTabState } from './hooks/useTabState'
import type { ThemeMode, AppConfig } from '../types'

function App(): React.ReactElement {
  const {
    tabs,
    activeTab,
    activeTabId,
    setActiveTree,
    createTab,
    closeTab,
    switchTab,
  } = useTabState()

  const [theme, setTheme] = useState<ThemeMode>('dark')

  // ── Load config on mount ─────────────────────────────
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.on('config:loaded', (raw: unknown) => {
      const config = raw as AppConfig
      if (config?.theme) {
        setTheme(config.theme)
      }
    })
    api.send('config:load')

    return () => {
      api.removeAllListeners('config:loaded')
    }
  }, [])

  // ── Keep <html> class in sync with theme ──────────────
  useEffect(() => {
    document.documentElement.className = theme === 'dark' ? 'theme-dark' : 'theme-light'
  }, [theme])

  // ── Toggle theme ──────────────────────────────────────
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark'
      // Persist
      window.electronAPI?.send('config:save', { theme: next } satisfies AppConfig)
      return next
    })
  }, [])

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitch={switchTab}
        onClose={closeTab}
        onCreate={createTab}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <div className="app-content">
        <SplitPane
          key={activeTabId}
          tree={activeTab.tree}
          onTreeChange={setActiveTree}
          theme={theme}
        />
      </div>
    </div>
  )
}

export default App
