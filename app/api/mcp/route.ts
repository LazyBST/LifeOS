import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { newAccumulator, READONLY_TOOLS, registry, runTool } from '@/lib/agent/registry';
import type { ToolContext } from '@/lib/agent/types';
import { bearerOk, handleRpc, makeLimiter, type McpDeps } from '@/lib/mcp/protocol';
import { recentlyTouched } from '@/lib/agent/chat';

// MCP endpoint (Streamable HTTP, stateless JSON). Authenticated by a bearer key, not by the browser session.
export const dynamic = 'force-dynamic';
const allow = makeLimiter(120, 60_000);

function deps(): McpDeps {
  return {
    appUrl: env.appUrl.replace(/\/$/, ''),
    tools: Object.values(registry).map((d) => ({ name: d.name, description: d.description, schema: d.schema, confirm: d.confirm, readOnly: READONLY_TOOLS.has(d.name) })),
    run: async (name, input) => {
      const ctx: ToolContext = { page: { route: '/', entity_type: 'none' }, channel: 'web', recent: await recentlyTouched(), now: new Date() };
      const out = await runTool(name, input, ctx, newAccumulator(false));
      return { message: out.message, pending: out.pending, data: out.data, cards: out.cards };
    },
  };
}

export async function POST(req: NextRequest) {
  let key: string;
  try { key = env.mcpApiKey; } catch { return NextResponse.json({ error: 'MCP is not configured on the server.' }, { status: 503 }); }
  if (!bearerOk(req.headers.get('authorization'), key)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  if (!allow()) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }

  const d = deps();
  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handleRpc(m as never, d)))).filter((r) => r !== null);
  if (replies.length === 0) return new NextResponse(null, { status: 202 }); // only notifications
  return NextResponse.json(Array.isArray(body) ? replies : replies[0]);
}

// This server is stateless and never streams, so GET (SSE) and DELETE (session end) are not supported.
export async function GET() { return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } }); }
export async function DELETE() { return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } }); }
