import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { bearerOk, formatOutcome, handleRpc, makeLimiter, type McpDeps } from '@/lib/mcp/protocol';

const calls: [string, unknown][] = [];
const deps: McpDeps = {
  appUrl: 'https://app.test',
  tools: [
    { name: 'task_create', description: 'Create a task', schema: z.object({ title: z.string().min(1), priority: z.enum(['P0', 'P1']).optional() }), readOnly: false },
    { name: 'goal_delete', description: 'Delete a goal', schema: z.object({ ref: z.string(), confirm: z.boolean().optional() }), confirm: true, readOnly: false },
    { name: 'task_list', description: 'List', schema: z.object({}), readOnly: true },
  ],
  run: async (name, input) => {
    calls.push([name, input]);
    if (name === 'boom') throw new Error('x');
    if (name === 'goal_delete') return { message: 'ask', pending: { options: [{ id: 'g1', label: 'Launch MVP' }, { id: 'g2', label: 'Launch v2', path: 'Business' }] } };
    return { message: 'Created "Fix login"', cards: [{ title: 'Task created', subtitle: 'Website', href: '/tasks/1' }], data: { id: 't1' } };
  },
};
const rpc = (method: string, params?: Record<string, unknown>, id: number | null = 1) => handleRpc({ jsonrpc: '2.0', id, method, params }, deps);

describe('MCP protocol', () => {
  it('initialize negotiates a version and carries instructions', async () => {
    const r = await rpc('initialize', { protocolVersion: '2025-03-26' });
    expect(r!.result).toMatchObject({ protocolVersion: '2025-03-26', serverInfo: { name: 'lifeos' }, capabilities: { tools: {} } });
    expect((r!.result as { instructions: string }).instructions).toMatch(/IST/);
    const old = await rpc('initialize', { protocolVersion: '1999-01-01' });
    expect((old!.result as { protocolVersion: string }).protocolVersion).toBe('2025-03-26');
  });
  it('notifications get no reply', async () => {
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps)).toBeNull();
  });
  it('tools/list gives JSON Schemas and safety hints', async () => {
    const r = await rpc('tools/list');
    const tools = (r!.result as { tools: { name: string; inputSchema: { properties: Record<string, unknown>; required?: string[] }; annotations: Record<string, boolean> }[] }).tools;
    const create = tools.find((t) => t.name === 'task_create')!;
    expect(create.inputSchema.properties.title).toBeTruthy();
    expect(create.inputSchema.required).toContain('title');
    expect(tools.find((t) => t.name === 'goal_delete')!.annotations.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === 'task_list')!.annotations.readOnlyHint).toBe(true);
  });
  it('tools/call validates, runs, and formats cards and ids', async () => {
    calls.length = 0;
    const bad = await rpc('tools/call', { name: 'task_create', arguments: { title: '' } });
    expect((bad!.result as { isError: boolean }).isError).toBe(true);
    expect(calls).toHaveLength(0); // invalid input never reaches the tool
    const good = await rpc('tools/call', { name: 'task_create', arguments: { title: 'Fix login' } });
    const text = (good!.result as { content: { text: string }[] }).content[0].text;
    expect(text).toContain('Created "Fix login"');
    expect(text).toContain('https://app.test/tasks/1');
    expect(calls).toEqual([['task_create', { title: 'Fix login' }]]);
  });
  it('ambiguous refs come back as numbered options with ids', async () => {
    const r = await rpc('tools/call', { name: 'goal_delete', arguments: { ref: 'launch' } });
    const text = (r!.result as { content: { text: string }[] }).content[0].text;
    expect(text).toContain('1. Launch MVP — id: g1');
    expect(text).toContain('2. Launch v2 (Business) — id: g2');
  });
  it('unknown tools and methods are errors', async () => {
    expect((await rpc('tools/call', { name: 'nope' }))!.error!.code).toBe(-32602);
    expect((await rpc('resources/list'))!.error!.code).toBe(-32601);
    expect((await handleRpc({ method: 'x' }, deps))!.error!.code).toBe(-32600);
  });
  it('a tool that throws is reported, not crashed', async () => {
    const d2: McpDeps = { ...deps, tools: [{ name: 'boom', description: '', schema: z.object({}), readOnly: true }] };
    const r = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'boom', arguments: {} } }, d2);
    expect((r!.result as { isError: boolean }).isError).toBe(true);
  });
  it('very large data is left out of the text', () => {
    expect(formatOutcome({ message: 'm', data: { x: 'y'.repeat(7000) } }, '')).toBe('m');
  });
});

describe('MCP auth and limits', () => {
  it('accepts only the exact bearer key', () => {
    const key = 'k'.repeat(40);
    expect(bearerOk(`Bearer ${key}`, key)).toBe(true);
    expect(bearerOk(`bearer ${key}`, key)).toBe(true);
    expect(bearerOk(`Bearer ${key}x`, key)).toBe(false);
    expect(bearerOk('Bearer short', key)).toBe(false);
    expect(bearerOk(null, key)).toBe(false);
    expect(bearerOk(key, key)).toBe(false);
  });
  it('limits bursts and recovers after the window', () => {
    const allow = makeLimiter(3, 1000);
    expect([allow(0), allow(1), allow(2), allow(3)]).toEqual([true, true, true, false]);
    expect(allow(1500)).toBe(true);
  });
});
