const { contextBridge, ipcRenderer } = require('electron')

const validSendChannels = [
  'terminal:create', 'terminal:resize', 'terminal:write', 'terminal:kill',
  'ai:chat',
  'config:load', 'config:save',
  'layout:load', 'layout:save',
  'filetree:readdir', 'filetree:open-file',
  'project:cwd-set',
  'chat:load', 'chat:save',
]

const validOnChannels = [
  'terminal:output', 'terminal:exit', 'terminal:error',
  'ai:chunk', 'ai:done',
  'config:loaded',
  'layout:loaded',
  'filetree:readdir-result',
  'project:selected',
  'chat:loaded', 'chat:saved',
]

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  send: (channel, ...args) => {
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },

  on: (channel, callback) => {
      // TEST
    if (validOnChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },

  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args)
  },

  removeAllListeners: (channel) => {
    if (validOnChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel)
    }
  },
})
