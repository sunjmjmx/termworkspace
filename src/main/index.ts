import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import os from 'os'
import { createPTY, PtyProcess } from './platform'
import https from 'https'
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync, realpathSync } from 'fs'
import type { AiChatRequest, AppConfig, LayoutData, FileTreeEntry, AiChatMessage, SaveApiKeyRequest, CustomProviderConfig } from '../types'
import { discoverProviders, getActiveProvider, hasAnyApiKey, saveApiKey, loadCustomProviders, addCustomProvider, removeCustomProvider, saveEnvKey } from './ai-config'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let mainWindow: BrowserWindow | null = null

// PTY registry — maps terminal IDs to their pty processes
const ptyRegistry = new Map<string, PtyProcess>()

// ── Config persistence ────────────────────────────────────
// Uses ~/.termworkspace/config/app-config.json (fixed path, independent of
// app.getPath('userData') which differs between dev and packaged builds).

const TW_HOME = path.join(os.homedir(), '.termworkspace')
const configDir = path.join(TW_HOME, 'config')
const configFile = path.join(configDir, 'app-config.json')

function loadConfig(): AppConfig {
  // Migration: if ~/.termworkspace/config/app-config.json doesn't exist but
  // a config from an older installation (dev or packaged) does, silently migrate it.
  if (!existsSync(configFile)) {
    const userDataRoot = path.dirname(app.getPath('userData'))
    const oldPaths = [
      path.join(userDataRoot, 'termworkspace-v2', 'config', 'app-config.json'),
      path.join(userDataRoot, 'com.termworkspace.v2', 'config', 'app-config.json'),
    ]
    for (const oldFile of oldPaths) {
      if (existsSync(oldFile)) {
        try {
          mkdirSync(configDir, { recursive: true })
          const raw = readFileSync(oldFile, 'utf-8')
          writeFileSync(configFile, raw, 'utf-8')
          console.log(`[termworkspace] migrated config: ${oldFile} → ${configFile}`)
          break
        } catch (e) {
          console.warn(`[termworkspace] config migration from ${oldFile} failed:`, e)
        }
      }
    }
  }

  try {
    if (existsSync(configFile)) {
      const raw = readFileSync(configFile, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AppConfig>
      return { theme: parsed.theme ?? 'dark', projectPath: parsed.projectPath, aiProvider: parsed.aiProvider }
    }
  } catch {
    // ignore corrupt config, use defaults
  }
  return { theme: 'dark' }
}

function saveConfig(config: AppConfig): void {
  mkdirSync(configDir, { recursive: true })
  writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8')
}

// ── Layout persistence ────────────────────────────────────

const layoutDir = TW_HOME
const layoutFile = path.join(layoutDir, 'layout.json')

function loadLayout(): LayoutData | null {
  try {
    if (existsSync(layoutFile)) {
      const raw = readFileSync(layoutFile, 'utf-8')
      const parsed = JSON.parse(raw) as LayoutData
      if (parsed?.tabs?.length && parsed?.activeTabId) {
        return parsed
      }
    }
  } catch {
    // corrupt or missing file, return null
  }
  return null
}

function saveLayout(layout: LayoutData): void {
  mkdirSync(layoutDir, { recursive: true })
  writeFileSync(layoutFile, JSON.stringify(layout, null, 2), 'utf-8')
}

// ── Chat persistence ────────────────────────────────────────

const chatDir = path.join(os.homedir(), '.termworkspace', 'chats')

function ensureChatDir(): void {
  mkdirSync(chatDir, { recursive: true })
}

function loadChat(chatId: string): AiChatMessage[] {
  try {
    const chatFile = path.join(chatDir, `${chatId}.json`)
    if (existsSync(chatFile)) {
      const raw = readFileSync(chatFile, 'utf-8')
      const parsed = JSON.parse(raw) as AiChatMessage[]
      return Array.isArray(parsed) ? parsed : []
    }
  } catch {
    // corrupt or missing file, return empty
  }
  return []
}

function saveChat(chatId: string, messages: AiChatMessage[]): void {
  ensureChatDir()
  const chatFile = path.join(chatDir, `${chatId}.json`)
  // Keep only the last 500 messages
  const sliced = messages.slice(-500)
  writeFileSync(chatFile, JSON.stringify(sliced, null, 2), 'utf-8')
}

// ── SSE parsing helper ───────────────────────────────────

/**
 * Parse a single SSE data: line and extract the delta content.
 * Returns null for [DONE], empty, or malformed lines.
 */
function parseSSEContent(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed === 'data: [DONE]') return null
  if (trimmed.startsWith('data: ')) {
    try {
      const json = JSON.parse(trimmed.slice(6))
      return json.choices?.[0]?.delta?.content || null
    } catch {
      return null
    }
  }
  return null
}

// ── Window creation ──────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(import.meta.dirname, '../../dist/index.html'))
  }
}

// ── Project folder selection ─────────────────────────────

async function promptProjectFolder(): Promise<string | null> {
  if (!mainWindow) return null

  // Use a standalone dialog (no browserWindow) to avoid window-state issues on macOS
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Project Folder',
    message: 'Choose a project folder to open in TermWorkspace',
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

// ── IPC Handlers ─────────────────────────────────────────

function setupIPC() {
  // dialog:select-project — open native folder picker
  ipcMain.handle('dialog:select-project', async (): Promise<string | null> => {
    console.log('[termworkspace] dialog:select-project invoked')
    const result = await promptProjectFolder()
    console.log('[termworkspace] dialog result:', result)
    return result
  })

  // terminal:create — spawn a new PTY process (delegated to platform.ts createPTY)
  ipcMain.on('terminal:create', (_event, terminalId: string, cwd?: string) => {
    // Kill existing PTY for this terminal ID
    const existing = ptyRegistry.get(terminalId)
    if (existing) {
      try { existing.kill() } catch { /* ignore */ }
      ptyRegistry.delete(terminalId)
    }

    const pty = createPTY(terminalId, cwd ?? os.homedir(), {
      onData: (data: string) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:output', terminalId, data)
        }
      },
      onExit: (code, _signal) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:exit', terminalId, code ?? -1)
        }
        ptyRegistry.delete(terminalId)
      },
      onError: (err) => {
        console.error(`[termworkspace] PTY error for ${terminalId}:`, err.message)
      },
    })

    ptyRegistry.set(terminalId, pty)
  })

  // terminal:write — send keystrokes to PTY stdin
  ipcMain.on('terminal:write', (_event, terminalId: string, data: string) => {
    const pty = ptyRegistry.get(terminalId)
    if (pty) {
      pty.write(data)
    }
  })

  // terminal:resize — resize PTY dimensions
  ipcMain.on('terminal:resize', (_event, terminalId: string, cols: number, rows: number) => {
    const pty = ptyRegistry.get(terminalId)
    if (pty) {
      pty.resize(cols, rows)
    }
  })

  // terminal:kill — kill PTY process and remove from registry
  ipcMain.on('terminal:kill', (_event, terminalId: string) => {
    const pty = ptyRegistry.get(terminalId)
    if (pty) {
      pty.kill()
      ptyRegistry.delete(terminalId)
    }
  })

  // ai:list-providers — return all discovered providers
  ipcMain.handle('ai:list-providers', () => {
    return discoverProviders()
  })

  // ai:get-active — return currently active provider (or null if none configured)
  ipcMain.handle('ai:get-active', () => {
    const config = loadConfig()
    const result = getActiveProvider(config.aiProvider)
    return result ? result.provider : null
  })

  // ai:set-active — persist selected provider ID to AppConfig
  ipcMain.handle('ai:set-active', (_event, providerId: string) => {
    const config = loadConfig()
    config.aiProvider = providerId
    saveConfig(config)
    return { success: true }
  })

  // ai:chat — send prompt to LLM API with streaming response
  ipcMain.on('ai:chat', (_event, request: AiChatRequest) => {
    const { terminalId, prompt, model: modelOverride, systemPrompt } = request

    // Load AppConfig and discover active provider
    const config = loadConfig()
    const activeResult = getActiveProvider(config.aiProvider)
    if (!activeResult || !activeResult.provider.configured) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:chunk', terminalId, '\n❌ No API key found. Set KIMI_API_KEY or DEEPSEEK_API_KEY in .env')
        mainWindow.webContents.send('ai:done', terminalId)
      }
      return
    }

    const model = modelOverride ?? activeResult.config.model

    // Build request body (OpenAI-compatible format)
    const messages: { role: string; content: string }[] = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const body = JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: 4096,
    })

    const url = new URL(`${activeResult.config.baseUrl}/chat/completions`)

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeResult.config.apiKey}`,
        'Content-Length': Buffer.byteLength(body).toString(),
      },
    }

    const req = https.request(options, (res) => {
      let buffer = ''

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf-8')

        // Parse SSE lines, keeping incomplete last line in buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const content = parseSSEContent(line)
          if (content && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ai:chunk', terminalId, content)
          }
        }
      })

      res.on('end', () => {
        // Flush remaining buffer
        if (buffer.trim()) {
          const content = parseSSEContent(buffer)
          if (content && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ai:chunk', terminalId, content)
          }
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai:done', terminalId)
        }
      })
    })

    req.setTimeout(30000, () => {
      req.destroy()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:chunk', terminalId, `\n❌ Request timed out after 30s`)
        mainWindow.webContents.send('ai:done', terminalId)
      }
    })

    req.on('error', (err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:chunk', terminalId, `\n❌ Network error: ${err.message}`)
        mainWindow.webContents.send('ai:done', terminalId)
      }
    })

    req.write(body)
    req.end()
  })

  // config:load — return current config + API key status
  ipcMain.on('config:load', (event) => {
    const config = loadConfig()
    event.reply('config:loaded', config)
    event.reply('config:apikey-status', {
      noApiKey: !hasAnyApiKey(),
      isPackaged: !VITE_DEV_SERVER_URL,
    })
  })

  // config:save — persist and broadcast
  ipcMain.on('config:save', (_event, config: AppConfig) => {
    saveConfig(config)
  })

  // config:save-api-key — save provider API key to ~/.termworkspace/.env
  ipcMain.on('config:save-api-key', (event, request: SaveApiKeyRequest) => {
    const { provider, key } = request
    console.log(`[termworkspace] config:save-api-key for provider "${provider}"`)
    const ok = saveApiKey(provider, key)
    if (!ok) {
      console.warn(`[termworkspace] unknown provider: "${provider}"`)
    }
    // Broadcast updated status to all windows
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('config:apikey-status', {
        noApiKey: !hasAnyApiKey(),
        isPackaged: !VITE_DEV_SERVER_URL,
      })
    }
  })

  // config:list-custom-providers — return all custom providers
  ipcMain.handle('config:list-custom-providers', () => {
    return loadCustomProviders()
  })

  // config:save-custom-provider — add/update a custom provider and save API key
  ipcMain.on('config:save-custom-provider', (_event, request: CustomProviderConfig & { apiKey: string }) => {
    const { apiKey, ...providerConfig } = request
    console.log(`[termworkspace] config:save-custom-provider: "${providerConfig.id}"`)

    // Save the custom provider definition
    addCustomProvider(providerConfig)

    // Save the API key to .env under the user-specified env key
    if (apiKey && apiKey.trim()) {
      saveEnvKey(providerConfig.envKey, apiKey.trim())
    }

    // Broadcast updated status
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('config:apikey-status', {
        noApiKey: !hasAnyApiKey(),
        isPackaged: !VITE_DEV_SERVER_URL,
      })
    }
  })

  // layout:load — return saved layout
  ipcMain.on('layout:load', (event) => {
    const layout = loadLayout()
    event.reply('layout:loaded', layout)
  })

  // layout:save — persist tab layout
  ipcMain.on('layout:save', (_event, layout: LayoutData) => {
    saveLayout(layout)
  })

  // filetree:readdir — list directory contents
  ipcMain.on('filetree:readdir', (event, dirPath: string) => {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      const result = entries
        .filter((entry) => !entry.name.startsWith('.'))
        .map((entry) => ({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          isDirectory: entry.isDirectory(),
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })
      event.reply('filetree:readdir-result', result)
    } catch {
      event.reply('filetree:readdir-result', [])
    }
  })

  // filetree:open-file — write file path to the active terminal's PTY
  ipcMain.on('filetree:open-file', (_event, terminalId: string, filePath: string) => {
    const pty = ptyRegistry.get(terminalId)
    if (pty) {
      // Echo the path into the terminal so the user sees it
      pty.write(`echo '${filePath.replace(/'/g, "'\\''")}'\n`)
    }
  })

  // project:cwd-set — save project path to config and notify all windows
  ipcMain.on('project:cwd-set', (_event, projectPath: string) => {
    const config = loadConfig()
    config.projectPath = projectPath
    saveConfig(config)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project:selected', projectPath)
    }
  })

  // chat:load — load persisted messages for a chat session
  ipcMain.on('chat:load', (event, chatId: string) => {
    const messages = loadChat(chatId)
    event.reply('chat:loaded', chatId, messages)
  })

  // chat:save — persist current messages to disk
  ipcMain.on('chat:save', (_event, chatId: string, messages: AiChatMessage[]) => {
    saveChat(chatId, messages)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chat:saved', chatId)
    }
  })
}

// ── App lifecycle ─────────────────────────────────────────

app.whenReady().then(() => {
  setupIPC()
  createWindow()

  // On ready-to-show, check if project path is set; if not, prompt the user.
  // On ready-to-show, check if project path is set; if not, the renderer
  // shows the project picker overlay. The user clicks the button to open the dialog.
  mainWindow?.on('ready-to-show', () => {
    const config = loadConfig()

    if (config.projectPath) {
      // Already have a project path — send it to the renderer
      mainWindow?.webContents.send('project:selected', config.projectPath)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// ── PTY cleanup on app exit ────────────────────────────────

function cleanupPTYs() {
  for (const [id, pty] of ptyRegistry) {
    pty.kill()
  }
  ptyRegistry.clear()
}

app.on('window-all-closed', () => {
  // On macOS: closing the last window should NOT quit the app.
  // The app stays alive in the dock; PTY processes must survive
  // so they're available when the user re-opens the window via dock click.
  if (process.platform !== 'darwin') {
    cleanupPTYs()
    app.quit()
  }
})

app.on('before-quit', (event) => {
  // macOS Cmd+Q: prevent default quit handling — we control it via will-quit
  // This ensures the app quits cleanly (PTY cleanup happens in will-quit)
  // without accidentally skipping cleanup.
})

app.on('will-quit', () => {
  // Actual app exit (Cmd+Q, macOS menu Quit, Windows close):
  // kill all PTY processes before the process terminates.
  cleanupPTYs()
})
