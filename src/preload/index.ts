import { contextBridge, ipcRenderer } from 'electron'

const validSendChannels = [
  'terminal:create', 'terminal:resize', 'terminal:write', 'terminal:kill',
  'ai:chat',
]

const validOnChannels = [
  'terminal:output', 'terminal:exit', 'terminal:error',
  'ai:chunk', 'ai:done',
]

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  send: (channel: string, ...args: unknown[]) => {
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (validOnChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },

  removeAllListeners: (channel: string) => {
    if (validOnChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel)
    }
  },
})
