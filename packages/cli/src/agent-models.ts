import type { AgentProvider } from '@parallax/common'

type ModelOption = { value: string; label: string; hint?: string }

const MODELS_BY_PROVIDER: Record<AgentProvider, ModelOption[]> = {
  'claude-code': [
    { value: 'claude-opus-4-7', label: 'claude-opus-4-7', hint: 'most capable' },
    { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6', hint: 'balanced (default)' },
    { value: 'claude-haiku-4-5', label: 'claude-haiku-4-5', hint: 'fast, low cost' },
  ],
  codex: [
    { value: 'gpt-5-codex', label: 'gpt-5-codex', hint: 'optimized for coding' },
    { value: 'gpt-5', label: 'gpt-5', hint: 'general purpose' },
    { value: 'o3', label: 'o3', hint: 'reasoning' },
  ],
  gemini: [
    { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro', hint: 'most capable' },
    { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash', hint: 'fast' },
  ],
}

export function getModelOptions(provider: AgentProvider): ModelOption[] {
  return MODELS_BY_PROVIDER[provider] ?? []
}
