import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,

  // IPC helpers (will be expanded by subsequent phases)
  send: (channel: string, ...args: unknown[]) => {
    const validChannels = ['terminal:create', 'terminal:resize', 'terminal:write']
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = ['terminal:output', 'terminal:exit', 'terminal:error']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
