import { describe, expect, it } from 'vitest';
import { generateText, stepCountIs } from 'ai';

process.env.LLM_PROVIDER = 'google';
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';

type Body = { tools?: { functionDeclarations: { name: string; description: string; parameters?: Record<string, unknown> }[] }[]; systemInstruction?: unknown; contents?: unknown[] };

const UNSUPPORTED = ['anyOf', 'oneOf', 'allOf', '$ref', '$schema', 'additionalProperties', 'propertyNames', 'const', 'exclusiveMinimum', 'exclusiveMaximum'];
function offenders(node: unknown, path = ''): string[] {
  if (Array.isArray(node)) return node.flatMap((n, i) => offenders(n, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => [...(UNSUPPORTED.includes(k) ? [`${path}.${k}`] : []), ...offenders(v, `${path}.${k}`)]);
  }
  return [];
}

describe('Gemini chat provider', () => {
  it('builds a valid request for every tool, with a schema subset Gemini accepts', async () => {
    const { chatModel, modelNames } = await import('@/lib/agent/model');
    const { newAccumulator, registry, toAiTools } = await import('@/lib/agent/registry');
    let captured: Body | null = null;
    let url = '';
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      captured = JSON.parse(String(init?.body)) as Body;
      return new Response(JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP', index: 0 }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const acc = newAccumulator(false);
    const tools = toAiTools({ page: { route: '/', entity_type: 'none' }, channel: 'web', recent: [], now: new Date() }, acc);
    const result = await generateText({ model: chatModel(fakeFetch), system: 'sys', prompt: 'hello', tools, stopWhen: stepCountIs(2) });

    expect(result.text).toBe('ok');
    expect(url).toContain(`models/${modelNames().chat}:generateContent`);
    const decls = captured!.tools![0].functionDeclarations;
    expect(decls.map((d) => d.name).sort()).toEqual(Object.keys(registry).sort());
    const bad = decls.flatMap((d) => offenders(d.parameters, d.name));
    expect(bad).toEqual([]);
  });

  it('ignores a leftover model name from the other provider', async () => {
    const { pickModel } = await import('@/lib/agent/model');
    expect(pickModel('claude-sonnet-5', 'gemini-2.5-flash', 'google')).toBe('gemini-2.5-flash');
    expect(pickModel('gemini-2.5-pro', 'claude-sonnet-5', 'anthropic')).toBe('claude-sonnet-5');
    expect(pickModel('gemini-2.5-pro', 'gemini-2.5-flash', 'google')).toBe('gemini-2.5-pro');
    expect(pickModel('  ', 'gemini-2.5-flash', 'google')).toBe('gemini-2.5-flash');
    expect(pickModel(undefined, 'x', 'google')).toBe('x');
  });

  it('defaults to Claude when LLM_PROVIDER is unset', async () => {
    const { llmProvider } = await import('@/lib/agent/model');
    const was = process.env.LLM_PROVIDER;
    delete process.env.LLM_PROVIDER;
    expect(llmProvider()).toBe('anthropic');
    process.env.LLM_PROVIDER = 'google';
    expect(llmProvider()).toBe('google');
    if (was) process.env.LLM_PROVIDER = was;
  });

  it('chooses models by provider and lets env override them', async () => {
    const { modelNames, keyEnvName } = await import('@/lib/agent/model');
    expect(modelNames('google').chat).toMatch(/^gemini/);
    expect(modelNames('anthropic').chat).toBe('claude-sonnet-5-5');
    expect(keyEnvName('google')).toBe('GOOGLE_GENERATIVE_AI_API_KEY');
    process.env.CHAT_MODEL = 'gemini-custom';
    expect(modelNames('google').chat).toBe('gemini-custom');
    delete process.env.CHAT_MODEL;
  });
});
