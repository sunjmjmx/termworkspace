// ── Channel definitions ──────────────────────────────────

export const TERMINAL_CHANNELS = {
  send: ['terminal:create', 'terminal:resize', 'terminal:write', 'terminal:kill'] as const,
  on: ['terminal:output', 'terminal:exit', 'terminal:error'] as const,
} as const

export const AI_CHANNELS = {
  send: ['ai:chat'] as const,
  on: ['ai:chunk', 'ai:done'] as const,
  invoke: ['ai:list-providers', 'ai:get-active', 'ai:set-active'] as const,
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

// ── AI Provider types ───────────────────────────────────

export interface AiProvider {
  id: string
  name: string
  model: string
  baseUrl: string
  apiKey: string
  configured: boolean
}

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
  projectPath?: string
  aiProvider?: string
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

// ── Chat persistence ──────────────────────────────────────

export const CHAT_CHANNELS = {
  send: ['chat:load', 'chat:save'] as const,
  on: ['chat:loaded', 'chat:saved'] as const,
} as const

export type ChatSendChannel = (typeof CHAT_CHANNELS.send)[number]
export type ChatOnChannel = (typeof CHAT_CHANNELS.on)[number]

// ── Chat persistence interface ────────────────────────────

export interface ChatPersistence {
  loadChat(chatId: string): AiChatMessage[]
  saveChat(chatId: string, messages: AiChatMessage[]): void
}

// ── File tree types ──────────────────────────────────────

export interface FileTreeEntry {
  name: string
  path: string
  isDirectory: boolean
}

export const FILETREE_CHANNELS = {
  send: ['filetree:readdir', 'filetree:open-file'] as const,
  on: ['filetree:readdir-result'] as const,
} as const

export type FileTreeSendChannel = (typeof FILETREE_CHANNELS.send)[number]
export type FileTreeOnChannel = (typeof FILETREE_CHANNELS.on)[number]

// ── Project dialog channels ──────────────────────────────

export const PROJECT_CHANNELS = {
  send: ['project:cwd-set'] as const,
  on: ['project:selected'] as const,
} as const

export type ProjectSendChannel = (typeof PROJECT_CHANNELS.send)[number]
export type ProjectOnChannel = (typeof PROJECT_CHANNELS.on)[number]

// ── Electron API type declarations ───────────────────────

export interface ElectronAPI {
  platform: NodeJS.Platform
  send: (channel: ValidSendChannel | ConfigSendChannel | LayoutSendChannel | ChatSendChannel | FileTreeSendChannel | ProjectSendChannel, ...args: unknown[]) => void
  on: (channel: ValidOnChannel | ConfigOnChannel | LayoutOnChannel | ChatOnChannel | FileTreeOnChannel | ProjectOnChannel, callback: (...args: unknown[]) => void) => () => void
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  removeAllListeners: (channel: ValidOnChannel | ConfigOnChannel | LayoutOnChannel | ChatOnChannel | FileTreeOnChannel | ProjectOnChannel) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
