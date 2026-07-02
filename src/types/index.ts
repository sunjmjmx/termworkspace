// Terminal channel names for type-safe IPC
export const TERMINAL_CHANNELS = {
  send: ['terminal:create', 'terminal:resize', 'terminal:write'] as const,
  on: ['terminal:output', 'terminal:exit', 'terminal:error'] as const,
} as const

export type TerminalSendChannel = (typeof TERMINAL_CHANNELS.send)[number]
export type TerminalOnChannel = (typeof TERMINAL_CHANNELS.on)[number]

// Binary tree split pane node types
export type SplitDirection = 'horizontal' | 'vertical'

export interface SplitLeaf {
  type: 'leaf'
  id: string
}

export interface SplitBranch {
  type: 'split'
  direction: SplitDirection
  children: [SplitNode, SplitNode]
}

export type SplitNode = SplitLeaf | SplitBranch

// Type declarations for the electronAPI exposed via preload
export interface ElectronAPI {
  platform: NodeJS.Platform
  send: (channel: TerminalSendChannel, ...args: unknown[]) => void
  on: (channel: TerminalOnChannel, callback: (...args: unknown[]) => void) => void
  removeAllListeners: (channel: TerminalOnChannel) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
