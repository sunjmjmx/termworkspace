import React, { useState, useEffect, useCallback, useRef } from 'react'
import { SplitPane } from './components/SplitPane'
import { TabBar } from './components/TabBar'
import { useTabState } from './hooks/useTabState'
import type { ThemeMode, AppConfig, LayoutData } from '../types'

function App(): React.ReactElement {
  const {
    tabs,
    activeTab,
    activeTabId,
    setActiveTree,
    createTab,
    closeTab,
    switchTab,
    restoreTabs,
  } = useTabState()

  const [theme, setTheme] = useState<ThemeMode>('dark')

  // Ref to track whether initial layout has been restored
  // Prevents auto-save from firing on the initial load
  const layoutLoaded = useRef(false)

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

  // ── Load layout on mount ─────────────────────────────
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.on('layout:loaded', (raw: unknown) => {
      const data = raw as LayoutData | null
      if (data?.tabs?.length && data?.activeTabId) {
        restoreTabs(data.tabs, data.activeTabId)
      }
      layoutLoaded.current = true
    })
    api.send('layout:load')

    // Timeout fallback: even if no layout.json exists, mark as loaded
    const fallback = setTimeout(() => {
      layoutLoaded.current = true
    }, 300)

    return () => {
      api.removeAllListeners('layout:loaded')
      clearTimeout(fallback)
    }
  }, [restoreTabs])

  // ── Auto-save layout on tabs change ──────────────────
  useEffect(() => {
    if (layoutLoaded.current && tabs.length > 0) {
      const layout: LayoutData = { tabs, activeTabId }
      window.electronAPI?.send('layout:save', layout)
    }
  }, [tabs, activeTabId])

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
