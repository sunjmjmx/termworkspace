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

// ── AI Chat types ───────────────────────────────────────

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

// ── Tab types ───────────────────────────────────────────

export interface Tab {
  id: string
  title: string
  tree: SplitNode
}

// ── Theme types ───────────────────────────────────────────

export type ThemeMode = 'dark' | 'light'

export interface AppConfig {
  theme: ThemeMode
}

export const CONFIG_CHANNELS = {
  send: ['config:load', 'config:save'] as const,
  on: ['config:loaded'] as const,
} as const

export type ConfigSendChannel = (typeof CONFIG_CHANNELS.send)[number]
export type ConfigOnChannel = (typeof CONFIG_CHANNELS.on)[number]

// ── Layout persistence ────────────────────────────────────

export interface LayoutData {
  tabs: Tab[]
  activeTabId: string
}

export const LAYOUT_CHANNELS = {
  send: ['layout:load', 'layout:save'] as const,
  on: ['layout:loaded'] as const,
} as const

export type LayoutSendChannel = (typeof LAYOUT_CHANNELS.send)[number]
export type LayoutOnChannel = (typeof LAYOUT_CHANNELS.on)[number]

// ── Electron API type declarations ───────────────────────

export interface ElectronAPI {
  platform: NodeJS.Platform
  send: (channel: ValidSendChannel | ConfigSendChannel | LayoutSendChannel, ...args: unknown[]) => void
  on: (channel: ValidOnChannel | ConfigOnChannel | LayoutOnChannel, callback: (...args: unknown[]) => void) => void
  removeAllListeners: (channel: ValidOnChannel | ConfigOnChannel | LayoutOnChannel) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
