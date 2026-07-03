import { readFileSync, existsSync } from 'fs'
import path from 'path'
import type { AiProvider } from '../types'

const PROVIDER_DEFS = [
  { id: 'kimi', name: 'Kimi', model: 'kimi-k2.6', baseUrl: 'https://api.moonshot.cn/v1', envKey: 'KIMI_API_KEY' },
  { id: 'deepseek', name: 'DeepSeek', model: 'deepseek-v4-flash', baseUrl: 'https://api.deepseek.com', envKey: 'DEEPSEEK_API_KEY' },
]

/**
 * Try to find an API key from .env or process.env
 */
function findEnvKey(keyName: string): string | null {
  // Try reading .env from project root (resolved relative to dist/main/)
  const envPath = path.join(import.meta.dirname, '../../.env')
  if (existsSync(envPath)) {
    const text = readFileSync(envPath, 'utf-8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith(`${keyName}=`)) {
        return trimmed.slice(`${keyName}=`.length).replace(/['"]/g, '')
      }
    }
  }

  // Fall back to process.env
  return process.env[keyName] ?? null
}

/**
 * Discover all configured providers from .env and process.env
 */
export function discoverProviders(): AiProvider[] {
  return PROVIDER_DEFS.map((def) => {
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
