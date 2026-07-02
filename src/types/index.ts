// Type declarations for the electronAPI exposed via preload
export interface ElectronAPI {
  platform: NodeJS.Platform
  send: (channel: string, data: unknown) => void
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
