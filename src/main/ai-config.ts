import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import os from 'os'
import type { AiProvider, CustomProviderConfig } from '../types'

const PROVIDER_DEFS = [
  { id: 'kimi', name: 'Kimi', model: 'kimi-k2.6', baseUrl: 'https://api.moonshot.cn/v1', envKey: 'KIMI_API_KEY' },
  { id: 'deepseek', name: 'DeepSeek', model: 'deepseek-v4-flash', baseUrl: 'https://api.deepseek.com', envKey: 'DEEPSEEK_API_KEY' },
]

const TW_HOME = path.join(os.homedir(), '.termworkspace')
const CUSTOM_PROVIDER_FILE = path.join(TW_HOME, 'config', 'custom-providers.json')

// ── Custom provider persistence ─────────────────────────

function ensureCustomProviderDir(): void {
  mkdirSync(path.dirname(CUSTOM_PROVIDER_FILE), { recursive: true })
}

export function loadCustomProviders(): CustomProviderConfig[] {
  try {
    if (existsSync(CUSTOM_PROVIDER_FILE)) {
      const raw = readFileSync(CUSTOM_PROVIDER_FILE, 'utf-8')
      const parsed = JSON.parse(raw) as CustomProviderConfig[]
      return Array.isArray(parsed) ? parsed : []
    }
  } catch {
    // corrupt file, ignore
  }
  return []
}

export function saveCustomProviders(providers: CustomProviderConfig[]): void {
  ensureCustomProviderDir()
  writeFileSync(CUSTOM_PROVIDER_FILE, JSON.stringify(providers, null, 2), 'utf-8')
}

export function addCustomProvider(provider: CustomProviderConfig): void {
  const all = loadCustomProviders()
  // Replace existing with same id, or append
  const idx = all.findIndex((p) => p.id === provider.id)
  if (idx >= 0) {
    all[idx] = provider
  } else {
    all.push(provider)
  }
  saveCustomProviders(all)
}

export function removeCustomProvider(id: string): void {
  const all = loadCustomProviders().filter((p) => p.id !== id)
  saveCustomProviders(all)
}

/**
 * Try to find an API key from .env or process.env
 */
function findEnvKey(keyName: string): string | null {
  // Multi-level .env lookup:
  //   a) <project-root>/.env        — dev scenario
  //   d) process.env                 — shell env (app launched via terminal)
  //   b) ~/.termworkspace/.env       — packaged .app scenario (recommended)
  //   c) ~/.env                      — backup
  // Priority: a > d > b > c

  // a) Project root .env (resolved relative to dist/main/)
  const projectEnv = path.join(import.meta.dirname, '../../.env')
  if (existsSync(projectEnv)) {
    const val = readKeyFromEnvFile(projectEnv, keyName)
    if (val !== null) return val
  }

  // d) process.env
  if (process.env[keyName]) return process.env[keyName]!

  // b) ~/.termworkspace/.env (packaged .app: user places API key here)
  const termworkspaceEnv = path.join(os.homedir(), '.termworkspace', '.env')
  if (existsSync(termworkspaceEnv)) {
    const val = readKeyFromEnvFile(termworkspaceEnv, keyName)
    if (val !== null) return val
  }

  // c) ~/.env (backup)
  const homeEnv = path.join(os.homedir(), '.env')
  if (existsSync(homeEnv)) {
    const val = readKeyFromEnvFile(homeEnv, keyName)
    if (val !== null) return val
  }

  return null
}

/**
 * Read a key from a .env file (simple line-by-line parser).
 */
function readKeyFromEnvFile(filePath: string, keyName: string): string | null {
  try {
    const text = readFileSync(filePath, 'utf-8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith(`${keyName}=`)) {
        return trimmed.slice(`${keyName}=`.length).replace(/['"]/g, '')
      }
    }
  } catch {
    // corrupt or unreadable file, skip
  }
  return null
}

/**
 * Discover all configured providers from .env, process.env, and custom providers.
 */
export function discoverProviders(): AiProvider[] {
  const builtins = PROVIDER_DEFS.map((def) => {
    const apiKey = findEnvKey(def.envKey)
    return {
      id: def.id,
      name: def.name,
      model: def.model,
      baseUrl: def.baseUrl,
      apiKey: apiKey ?? '',
      configured: apiKey !== null,
    }
  })

  // Merge custom providers
  const custom = loadCustomProviders().map((cp) => {
    const apiKey = findEnvKey(cp.envKey)
    return {
      id: cp.id,
      name: cp.name,
      model: cp.model,
      baseUrl: cp.baseUrl,
      apiKey: apiKey ?? '',
      configured: apiKey !== null,
    }
  })

  return [...builtins, ...custom]
}

/**
 * Check if any provider has a configured API key.
 */
export function hasAnyApiKey(): boolean {
  const providers = discoverProviders()
  return providers.some((p) => p.configured)
}

/**
 * Get the active provider config for making API calls.
 * Merges activeProviderId from AppConfig with discovered provider credentials.
 */
export function getActiveProvider(activeProviderId?: string): { provider: AiProvider; config: { apiKey: string; baseUrl: string; model: string } } | null {
  const providers = discoverProviders()

  // If a specific provider is requested, try to find it
  let active: AiProvider | undefined
  if (activeProviderId) {
    active = providers.find((p) => p.id === activeProviderId)
  }

  // Fall back to first configured provider, then first provider overall
  if (!active) {
    active = providers.find((p) => p.configured) ?? providers[0]
  }

  if (!active) return null

  return {
    provider: active,
    config: {
      apiKey: active.apiKey,
      baseUrl: active.baseUrl,
      model: active.model,
    },
  }
}

/**
 * Provider ID → env key name mapping.
 */
const PROVIDER_KEY_MAP: Record<string, string> = {
  kimi: 'KIMI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
}

/**
 * Save an arbitrary key=value to ~/.termworkspace/.env.
 * Unlike saveApiKey, this takes the env key name directly (for custom providers).
 */
export function saveEnvKey(envKey: string, apiKey: string): void {
  writeEnvKey(envKey, apiKey)
}

/**
 * Save an API key to ~/.termworkspace/.env.
 * Replaces existing key for the same provider, appends if not present.
 */
export function saveApiKey(providerId: string, apiKey: string): boolean {
  // Check built-in provider mapping first
  const builtinEnvKey = PROVIDER_KEY_MAP[providerId]
  if (builtinEnvKey) {
    // Use built-in env key name
    writeEnvKey(builtinEnvKey, apiKey)
    return true
  }

  // Check custom providers
  const customProviders = loadCustomProviders()
  const custom = customProviders.find((p) => p.id === providerId)
  if (custom) {
    writeEnvKey(custom.envKey, apiKey)
    return true
  }

  return false
}

/**
 * Low-level key=value writer to ~/.termworkspace/.env.
 */
function writeEnvKey(envKey: string, apiKey: string): void {

  const twHome = path.join(os.homedir(), '.termworkspace')
  const envFile = path.join(twHome, '.env')

  // Read existing content or start fresh
  let lines: string[] = []
  if (existsSync(envFile)) {
    const text = readFileSync(envFile, 'utf-8')
    lines = text.split('\n')
  }

  // Find existing entry for this key, or track where to append
  let replaced = false
  const newLines = lines.map((line) => {
    const trimmed = line.trim()
    if (trimmed.startsWith(`${envKey}=`)) {
      replaced = true
      return `${envKey}=${apiKey}`
    }
    return line
  })

  if (!replaced) {
    // Remove trailing empty lines, add new entry
    while (newLines.length > 0 && newLines[newLines.length - 1].trim() === '') {
      newLines.pop()
    }
    newLines.push(`${envKey}=${apiKey}`)
  }

  // Ensure trailing newline
  newLines.push('')

  mkdirSync(twHome, { recursive: true })
  writeFileSync(envFile, newLines.join('\n'), 'utf-8')

  // Update process.env so in-memory reads pick it up immediately
  process.env[envKey] = apiKey
}
