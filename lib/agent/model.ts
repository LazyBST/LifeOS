import 'server-only';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export type Provider = 'google' | 'anthropic';

/** Gemini is the default; set LLM_PROVIDER=anthropic to switch back. Nothing else in the app knows the provider. */
export function llmProvider(): Provider {
  return (process.env.LLM_PROVIDER ?? 'google').trim().toLowerCase() === 'anthropic' ? 'anthropic' : 'google';
}

const DEFAULTS: Record<Provider, { chat: string; cheap: string }> = {
  google: { chat: 'gemini-2.5-flash', cheap: 'gemini-2.5-flash-lite' },
  anthropic: { chat: 'claude-sonnet-5', cheap: 'claude-haiku-4-5-20251001' },
};

/** An override only applies if it belongs to the active provider: a leftover CHAT_MODEL=claude-… must not be sent to Gemini. */
export function pickModel(override: string | undefined, fallback: string, provider: Provider): string {
  const name = override?.trim();
  if (!name) return fallback;
  const isClaude = /^claude/i.test(name);
  const isGemini = /^(gemini|gemma|models\/gemini)/i.test(name);
  if ((provider === 'google' && isClaude) || (provider === 'anthropic' && isGemini)) {
    console.warn(`[model] Ignoring "${name}": it is not a ${provider} model. Using ${fallback}.`);
    return fallback;
  }
  return name;
}

export function modelNames(provider = llmProvider()): { chat: string; cheap: string } {
  return {
    chat: pickModel(process.env.CHAT_MODEL, DEFAULTS[provider].chat, provider),
    cheap: pickModel(process.env.CHEAP_MODEL, DEFAULTS[provider].cheap, provider),
  };
}

/** The API key's env var name for the active provider, for the settings diagnostics. */
export function keyEnvName(provider = llmProvider()): string {
  return provider === 'google' ? 'GOOGLE_GENERATIVE_AI_API_KEY' : 'ANTHROPIC_API_KEY';
}

function build(name: string, fetchImpl?: typeof fetch): LanguageModel {
  if (llmProvider() === 'google') {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY (a Gemini API key from aistudio.google.com/apikey).');
    return createGoogleGenerativeAI({ apiKey, ...(fetchImpl ? { fetch: fetchImpl } : {}) })(name);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY.');
  return createAnthropic({ apiKey, ...(fetchImpl ? { fetch: fetchImpl } : {}) })(name);
}

/** Model for the chat agent (tool calling). */
export function chatModel(fetchImpl?: typeof fetch): LanguageModel {
  return build(modelNames().chat, fetchImpl);
}

/** Cheaper model for scheduled summaries (morning plan). */
export function cheapModel(fetchImpl?: typeof fetch): LanguageModel {
  return build(modelNames().cheap, fetchImpl);
}
