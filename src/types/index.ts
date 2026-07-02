// ── Channel definitions ──────────────────────────────────

export const TERMINAL_CHANNELS = {
  send: ['terminal:create', 'terminal:resize', 'terminal:write', 'terminal:kill'] as const,
  on: ['terminal:output', 'terminal:exit', 'terminal:error'] as const,
} as const

export const AI_CHANNELS = {
  send: ['ai:chat'] as const,
  on: ['ai:chunk', 'ai:done'] as const,
} as const

export type TerminalSendChannel = (typeof TERMINAL_CHANNELS.send)[number]
export type TerminalOnChannel = (typeof TERMINAL_CHANNELS.on)[number]

export type AiSendChannel = (typeof AI_CHANNELS.send)[number]
export type AiOnChannel = (typeof AI_CHANNELS.on)[number]

// Combined channel types for preload
export type ValidSendChannel = TerminalSendChannel | AiSendChannel
export type ValidOnChannel = TerminalOnChannel | AiOnChannel

// ── Binary tree split pane node types ────────────────────

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

// ── AI Chat types ───────────────────────────────────────—

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiChatRequest {
  terminalId: string
  prompt: string
  model?: string
  systemPrompt?: string
}

// ── Tab types ───────────────────────────────────────────—

export interface Tab {
  id: string
  title: string
  tree: SplitNode
}

// ── Electron API type declarations ───────────────────────

export interface ElectronAPI {
  platform: NodeJS.Platform
  send: (channel: ValidSendChannel, ...args: unknown[]) => void
  on: (channel: ValidOnChannel, callback: (...args: unknown[]) => void) => void
  removeAllListeners: (channel: ValidOnChannel) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
