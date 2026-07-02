import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import os from 'os'
import { spawn } from 'node-pty'
import https from 'https'
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import type { AiChatRequest, AppConfig, LayoutData, FileTreeEntry } from '../types'

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
      return { theme: parsed.theme ?? 'dark' }
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

// ── IPC Handlers ─────────────────────────────────────────

function setupIPC() {
  // terminal:create — spawn a new PTY process
  ipcMain.on('terminal:create', (_event, terminalId: string) => {
    const existing = ptyRegistry.get(terminalId)
    if (existing) {
      existing.kill()
      ptyRegistry.delete(terminalId)
    }

    const shell = process.env.SHELL || '/bin/zsh'
    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME,
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
}

// ── App lifecycle ─────────────────────────────────────────

app.whenReady().then(() => {
  setupIPC()
  createWindow()

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
