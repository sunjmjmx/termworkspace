import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { spawn } from 'node-pty'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let mainWindow: BrowserWindow | null = null

// PTY registry — maps terminal IDs to their pty processes
const ptyRegistry = new Map<string, ReturnType<typeof spawn>>()

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

// ── IPC Handlers ──────────────────────────────────────────

function setupIPC() {
  // terminal:create — spawn a new PTY process
  ipcMain.on('terminal:create', (_event, terminalId: string) => {
    // Clean up existing PTY for this ID if any
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

    // Forward PTY output to renderer
    pty.onData((data: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:output', terminalId, data)
      }
    })

    // Forward PTY exit to renderer
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
  // Clean up all PTYs before quit
  for (const [id, pty] of ptyRegistry) {
    pty.kill()
  }
  ptyRegistry.clear()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
