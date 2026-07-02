import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import os from 'os'
import { spawn } from 'node-pty'
import https from 'https'
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import type { AiChatRequest, AppConfig, LayoutData, FileTreeEntry, AiChatMessage } from '../types'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let mainWindow: BrowserWindow | null = null

// PTY registry — maps terminal IDs to their pty processes
const ptyRegistry = new Map<string, ReturnType<typeof spawn>>()

// ── Config persistence ────────────────────────────────────

const configDir = path.join(app.getPath('userData'), 'config')
const configFile = path.join(configDir, 'app-config.json')

function loadConfig(): AppConfig {
  try {
    if (existsSync(configFile)) {
      const raw = readFileSync(configFile, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AppConfig>
      return { theme: parsed.theme ?? 'dark', projectPath: parsed.projectPath }
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

// ── AI Config ────────────────────────────────────────────

interface AiConfig {
  apiKey: string
  baseUrl: string
  model: string
}

function loadAiConfig(): AiConfig | null {
  // Try reading .env from project root
  const envPath = path.join(__dirname, '../../.env')
  if (existsSync(envPath)) {
    const text = readFileSync(envPath, 'utf-8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('KIMI_API_KEY=')) {
        const key = trimmed.slice('KIMI_API_KEY='.length).replace(/['"]/g, '')
        return { apiKey: key, baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6' }
      }
      if (trimmed.startsWith('DEEPSEEK_API_KEY=')) {
        const key = trimmed.slice('DEEPSEEK_API_KEY='.length).replace(/['"]/g, '')
        return { apiKey: key, baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' }
      }
    }
  }

  // Fall back to process.env
  if (process.env.KIMI_API_KEY) {
    return { apiKey: process.env.KIMI_API_KEY, baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6' }
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { apiKey: process.env.DEEPSEEK_API_KEY, baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' }
  }

  return null
}

// ── Layout persistence ────────────────────────────────────

const layoutDir = path.join(os.homedir(), '.termworkspace')
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
      preload: path.join(__dirname, '../preload/index.js'),
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
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

// ── Project folder selection ─────────────────────────────

async function promptProjectFolder(): Promise<string | null> {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
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
    return await promptProjectFolder()
  })

  // terminal:create — spawn a new PTY process
  ipcMain.on('terminal:create', (_event, terminalId: string, cwd?: string) => {
    const existing = ptyRegistry.get(terminalId)
    if (existing) {
      existing.kill()
      ptyRegistry.delete(terminalId)
    }

    const shell = process.env.SHELL || '/bin/zsh'
    const ptyCwd = cwd || process.env.HOME || os.homedir()
    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: ptyCwd,
      env: { ...process.env } as { [key: string]: string },
    })

    ptyRegistry.set(terminalId, pty)

    pty.onData((data: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:output', terminalId, data)
      }
    })

    pty.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', terminalId, exitCode, signal)
      }
      ptyRegistry.delete(terminalId)
    })
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

  // ai:chat — send prompt to LLM API with streaming response
  ipcMain.on('ai:chat', (_event, request: AiChatRequest) => {
    const { terminalId, prompt, model: modelOverride, systemPrompt } = request

    // Load AI config
    const config = loadAiConfig()
    if (!config) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:chunk', terminalId, '\n❌ No API key found. Set KIMI_API_KEY or DEEPSEEK_API_KEY in .env')
        mainWindow.webContents.send('ai:done', terminalId)
      }
      return
    }

    const model = modelOverride ?? config.model

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

    const url = new URL(`${config.baseUrl}/chat/completions`)

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
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

  // config:load — return current config
  ipcMain.on('config:load', (event) => {
    const config = loadConfig()
    event.reply('config:loaded', config)
  })

  // config:save — persist and broadcast
  ipcMain.on('config:save', (_event, config: AppConfig) => {
    saveConfig(config)
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

  // On ready-to-show, check if project path is set; if not, prompt the user
  mainWindow?.on('ready-to-show', async () => {
    const config = loadConfig()

    if (!config.projectPath) {
      const selectedPath = await promptProjectFolder()
      if (selectedPath) {
        config.projectPath = selectedPath
        saveConfig(config)
        mainWindow?.webContents.send('project:selected', selectedPath)
      }
    } else {
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

app.on('window-all-closed', () => {
  for (const [id, pty] of ptyRegistry) {
    pty.kill()
  }
  ptyRegistry.clear()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
