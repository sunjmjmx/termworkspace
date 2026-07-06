import React, { useState, useEffect, useCallback, useRef } from 'react'
import { SplitPane } from './components/SplitPane'
import { TabBar } from './components/TabBar'
import { FileTree } from './components/FileTree'
import { useTabState } from './hooks/useTabState'
import type { ThemeMode, AppConfig, LayoutData, SplitNode, AiProvider, CustomProviderConfig } from '../types'

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
  const [noApiKey, setNoApiKey] = useState(false)
  const [isPackaged, setIsPackaged] = useState(false)

  // ── Settings modal state ──────────────────────────────
  const [showSettings, setShowSettings] = useState(false)
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({})
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({})
  const [savingKey, setSavingKey] = useState<Record<string, boolean>>({})
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // ── Custom provider form state ────────────────────────
  const [showCustomProviderForm, setShowCustomProviderForm] = useState(false)
  const [customProviderForm, setCustomProviderForm] = useState({
    name: '',
    baseUrl: '',
    model: '',
    apiKey: '',
    envKey: '',
  })
  const [customProviderSaveMsg, setCustomProviderSaveMsg] = useState<string | null>(null)

  const loadProviders = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    try {
      const list = (await api.invoke('ai:list-providers')) as AiProvider[]
      setProviders(list)
    } catch {
      // ignore
    }
  }, [])

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
      if (config?.projectPath) {
        setProjectPath(config.projectPath)
      }
    })

    api.on('config:apikey-status', (raw: unknown) => {
      const status = raw as { noApiKey: boolean; isPackaged: boolean }
      setNoApiKey(status.noApiKey)
      setIsPackaged(status.isPackaged)
      // Reload providers to reflect updated config status
      loadProviders()
    })
    api.send('config:load')

    return () => {
      api.removeAllListeners('config:loaded')
    }
  }, [loadProviders])

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
        // Notify main process — it saves to config and broadcasts `project:selected` back,
        // which triggers the single setProjectPath in the project:selected listener.
        // This avoids a dual-setProjectPath race with the readDir IPC handler.
        api.send('project:cwd-set', selectedPath)
      }
    } catch (err) {
      console.error('Failed to open project picker:', err)
    }
    setShowProjectPicker(false)
  }, [])

  // ── Settings handlers ─────────────────────────────────
  const openSettings = useCallback(async () => {
    await loadProviders()
    setShowSettings(true)
    setSaveMessage(null)
  }, [loadProviders])

  const closeSettings = useCallback(() => {
    setShowSettings(false)
    setSaveMessage(null)
  }, [])

  const handleKeyInputChange = useCallback((providerId: string, value: string) => {
    setApiKeyInputs((prev) => ({ ...prev, [providerId]: value }))
  }, [])

  const toggleKeyVisibility = useCallback((providerId: string) => {
    setShowKeyMap((prev) => ({ ...prev, [providerId]: !prev[providerId] }))
  }, [])

  const handleSaveKey = useCallback(async (providerId: string, key: string) => {
    const api = window.electronAPI
    if (!api || !key.trim()) return

    setSavingKey((prev) => ({ ...prev, [providerId]: true }))
    try {
      api.send('config:save-api-key', { provider: providerId, key: key.trim() })
      setSaveMessage(`${providers.find((p) => p.id === providerId)?.name ?? providerId} API key saved`)
      // Clear input after save
      setApiKeyInputs((prev) => {
        const next = { ...prev }
        delete next[providerId]
        return next
      })
    } catch (err) {
      setSaveMessage(`Failed to save key: ${err}`)
    } finally {
      setSavingKey((prev) => ({ ...prev, [providerId]: false }))
    }
  }, [providers])

  const resetCustomProviderForm = useCallback(() => {
    setCustomProviderForm({
      name: '',
      baseUrl: '',
      model: '',
      apiKey: '',
      envKey: '',
    })
    setCustomProviderSaveMsg(null)
  }, [])

  const handleCustomProviderFieldChange = useCallback((field: string, value: string) => {
    setCustomProviderForm((prev) => {
      const next = { ...prev, [field]: value }
      // Auto-fill envKey from name (uppercase + _API_KEY suffix)
      if (field === 'name' && !prev.envKey) {
        const autoKey = value.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY'
        next.envKey = autoKey
      }
      return next
    })
  }, [])

  const handleSaveCustomProvider = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return

    const { name, baseUrl, model, apiKey, envKey } = customProviderForm
    if (!name.trim() || !baseUrl.trim() || !model.trim()) {
      setCustomProviderSaveMsg('请填写 Provider 名称、Base URL 和模型名')
      return
    }

    const id = 'custom_' + name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')

    const provider: CustomProviderConfig & { apiKey: string } = {
      id,
      name: name.trim(),
      model: model.trim(),
      baseUrl: baseUrl.trim().replace(/\/+$/, ''),
      envKey: envKey.trim() || (name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY'),
      apiKey: apiKey.trim(),
    }

    api.send('config:save-custom-provider', provider)
    setCustomProviderSaveMsg(`✅ 自定义 Provider "${provider.name}" 已保存`)
    setShowCustomProviderForm(false)

    // Reload provider list to show the new one
    setTimeout(() => loadProviders(), 200)
  }, [customProviderForm, loadProviders])

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
          onOpenSettings={openSettings}
          noApiKey={noApiKey}
        />
        <div className="project-picker-overlay">
          {noApiKey && (
            <div className="api-key-warning">
              ⚠ 未配置 API 密钥 — 点击右上角 ⚙️ 设置中添加
            </div>
          )}
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
        {renderSettingsModal()}
      </div>
    )
  }

  // ── Empty state: all tabs closed ──────────────────────────
  if (tabs.length === 0) {
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
          onOpenSettings={openSettings}
          noApiKey={noApiKey}
        />
        {noApiKey && (
          <div className="api-key-warning api-key-warning-static">
            ⚠ 未配置 API 密钥 — 点击右上角 ⚙️ 设置中添加
          </div>
        )}
        <div className="app-content empty-state">
          <div className="empty-state-content">
            <div className="empty-state-icon">🖥️</div>
            <h2 className="empty-state-title">No Terminals Open</h2>
            <p className="empty-state-subtitle">Open a new terminal to get started</p>
            <button className="empty-state-btn" onClick={createTab}>
              + New Terminal
            </button>
          </div>
        </div>
        {renderSettingsModal()}
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
        onOpenSettings={openSettings}
        noApiKey={noApiKey}
      />
      {noApiKey && (
        <div className="api-key-warning api-key-warning-static">
          ⚠ 未配置 API 密钥 — 点击右上角 ⚙️ 设置中添加
        </div>
      )}
      <div className="app-content">
        <FileTree
          theme={theme}
          collapsed={fileTreeCollapsed}
          onToggleCollapse={toggleFileTree}
          activeTerminalId={activeTerminalId}
          projectPath={projectPath}
          onOpenFolder={openProjectPicker}
        />
        <SplitPane
          key={activeTabId}
          tree={activeTab.tree}
          onTreeChange={setActiveTree}
          theme={theme}
          projectPath={projectPath}
        />
      </div>
      {renderSettingsModal()}
    </div>
  )

  // ── Settings Modal ────────────────────────────────────
  function renderSettingsModal() {
    if (!showSettings) return null

    return (
      <div className="settings-overlay" onClick={closeSettings}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <div className="settings-modal-header">
            <h2 className="settings-modal-title">API 密钥配置</h2>
            <button className="settings-modal-close" onClick={closeSettings}>×</button>
          </div>

          <div className="settings-modal-body">
            {providers.map((p) => (
              <div key={p.id} className="settings-provider-row">
                <div className="settings-provider-info">
                  <span className="settings-provider-name">{p.name}</span>
                  <span className="settings-provider-model">{p.model}</span>
                  <span className={`settings-provider-status ${p.configured ? 'status-configured' : 'status-unconfigured'}`}>
                    {p.configured ? '✅ 已配置' : '❌ 未配置'}
                  </span>
                </div>
                <div className="settings-provider-input-row">
                  <div className="settings-input-wrapper">
                    <input
                      type={showKeyMap[p.id] ? 'text' : 'password'}
                      className="settings-input"
                      placeholder={p.configured ? 'Enter new key to replace...' : 'Enter API key...'}
                      value={apiKeyInputs[p.id] ?? ''}
                      onChange={(e) => handleKeyInputChange(p.id, e.target.value)}
                      spellCheck={false}
                    />
                    <button
                      className="settings-toggle-vis"
                      onClick={() => toggleKeyVisibility(p.id)}
                      title={showKeyMap[p.id] ? 'Hide key' : 'Show key'}
                    >
                      {showKeyMap[p.id] ? '👁' : '👁‍🗨'}
                    </button>
                  </div>
                  <button
                    className="settings-save-btn"
                    onClick={() => handleSaveKey(p.id, apiKeyInputs[p.id] ?? '')}
                    disabled={!apiKeyInputs[p.id]?.trim() || savingKey[p.id]}
                  >
                    {savingKey[p.id] ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ))}

            {providers.length === 0 && (
              <div className="settings-empty">
                <p>No providers available.</p>
              </div>
            )}

            {/* ── Custom provider section ──────────────── */}
            <div className="settings-section-divider" />

            <div className="settings-custom-provider-section">
              <button
                className="settings-custom-add-btn"
                onClick={() => {
                  resetCustomProviderForm()
                  setShowCustomProviderForm((prev) => !prev)
                }}
              >
                {showCustomProviderForm ? '− 收起' : '+ 添加自定义 Provider'}
              </button>

              {showCustomProviderForm && (
                <div className="settings-custom-form">
                  <div className="settings-custom-field">
                    <label className="settings-custom-label">Provider 名称</label>
                    <input
                      className="settings-input"
                      placeholder="例如: OpenAI"
                      value={customProviderForm.name}
                      onChange={(e) => handleCustomProviderFieldChange('name', e.target.value)}
                    />
                  </div>
                  <div className="settings-custom-field">
                    <label className="settings-custom-label">Base URL</label>
                    <input
                      className="settings-input"
                      placeholder="例如: https://api.openai.com/v1"
                      value={customProviderForm.baseUrl}
                      onChange={(e) => handleCustomProviderFieldChange('baseUrl', e.target.value)}
                    />
                  </div>
                  <div className="settings-custom-field">
                    <label className="settings-custom-label">模型名</label>
                    <input
                      className="settings-input"
                      placeholder="例如: gpt-4o"
                      value={customProviderForm.model}
                      onChange={(e) => handleCustomProviderFieldChange('model', e.target.value)}
                    />
                  </div>
                  <div className="settings-custom-field">
                    <label className="settings-custom-label">API Key</label>
                    <input
                      className="settings-input"
                      type="password"
                      placeholder="输入 API Key"
                      value={customProviderForm.apiKey}
                      onChange={(e) => handleCustomProviderFieldChange('apiKey', e.target.value)}
                    />
                  </div>
                  <div className="settings-custom-field">
                    <label className="settings-custom-label">环境变量名</label>
                    <input
                      className="settings-input"
                      placeholder="例如: OPENAI_API_KEY（自动从名称生成）"
                      value={customProviderForm.envKey}
                      onChange={(e) => handleCustomProviderFieldChange('envKey', e.target.value)}
                    />
                  </div>
                  <div className="settings-custom-form-actions">
                    <button
                      className="settings-custom-save-btn"
                      onClick={handleSaveCustomProvider}
                    >
                      保存
                    </button>
                    <button
                      className="settings-custom-cancel-btn"
                      onClick={() => {
                        setShowCustomProviderForm(false)
                        resetCustomProviderForm()
                      }}
                    >
                      取消
                    </button>
                  </div>
                  {customProviderSaveMsg && (
                    <div className="settings-save-message">{customProviderSaveMsg}</div>
                  )}
                </div>
              )}
            </div>

            {saveMessage && (
              <div className="settings-save-message">{saveMessage}</div>
            )}
          </div>

          <div className="settings-modal-footer">
            <p className="settings-hint">
              API keys are stored in <code>~/.termworkspace/.env</code>
            </p>
            <button className="settings-close-btn" onClick={closeSettings}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default App
