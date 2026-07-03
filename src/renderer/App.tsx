import React, { useState, useEffect, useCallback, useRef } from 'react'
import { SplitPane } from './components/SplitPane'
import { TabBar } from './components/TabBar'
import { FileTree } from './components/FileTree'
import { useTabState } from './hooks/useTabState'
import type { ThemeMode, AppConfig, LayoutData, SplitNode } from '../types'

/**
 * Walk the split tree to find the first leaf's terminal ID.
 */
function firstTerminalId(tree: SplitNode): string {
  if (tree.type === 'leaf') return `${tree.id}_term`
  return firstTerminalId(tree.children[0])
}

function App(): React.ReactElement {
  const cleanupTabPty = useCallback((terminalIds: string[]) => {
    for (const termId of terminalIds) {
      window.electronAPI?.send('terminal:kill', termId)
    }
  }, [])

  const {
    tabs,
    activeTab,
    activeTabId,
    setActiveTree,
    createTab,
    closeTab,
    switchTab,
    restoreTabs,
  } = useTabState({ onCleanupTab: cleanupTabPty })

  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  const toggleFileTree = useCallback(() => {
    setFileTreeCollapsed((prev) => !prev)
  }, [])

  // Get the active terminal ID from the active tab's tree
  const activeTerminalId = activeTab?.tree ? firstTerminalId(activeTab.tree) : ''

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

  // ── Handle project path from main process ────────────
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.on('project:selected', (raw: unknown) => {
      const path = raw as string
      if (path) {
        setProjectPath(path)
      }
    })

    return () => {
      api.removeAllListeners('project:selected')
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
    if (!layoutLoaded.current || tabs.length === 0) return
    // Only save if activeTabId still exists in the current tabs array
    if (!tabs.some((t) => t.id === activeTabId)) return
    const layout: LayoutData = { tabs, activeTabId }
    window.electronAPI?.send('layout:save', layout)
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

  // ── Open project folder picker ────────────────────────
  const openProjectPicker = useCallback(async () => {
    setShowProjectPicker(true)
    const api = window.electronAPI
    if (!api) {
      setShowProjectPicker(false)
      return
    }

    try {
      const result = await api.invoke('dialog:select-project')
      const selectedPath = result as string | null
      if (selectedPath) {
        setProjectPath(selectedPath)
        // Persist to config and notify all windows
        api.send('project:cwd-set', selectedPath)
      }
    } catch (err) {
      console.error('Failed to open project picker:', err)
    }
    setShowProjectPicker(false)
  }, [])

  // ── Project picker overlay (before project is selected) ──
  if (!projectPath) {
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
        <div className="project-picker-overlay">
          <div className="project-picker-card">
            <div className="project-picker-icon">📂</div>
            <h2 className="project-picker-title">TermWorkspace</h2>
            <p className="project-picker-subtitle">Select a project folder to get started</p>
            <button
              className="project-picker-btn"
              onClick={openProjectPicker}
              disabled={showProjectPicker}
            >
              {showProjectPicker ? 'Opening...' : 'Open Project Folder'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const currentConfig: AppConfig = { theme, projectPath }

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
        <FileTree
          theme={theme}
          collapsed={fileTreeCollapsed}
          onToggleCollapse={toggleFileTree}
          activeTerminalId={activeTerminalId}
          projectPath={projectPath}
        />
        <SplitPane
          key={activeTabId}
          tree={activeTab.tree}
          onTreeChange={setActiveTree}
          theme={theme}
          projectPath={projectPath}
        />
      </div>
    </div>
  )
}

export default App
