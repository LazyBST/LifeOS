// POST /api/chat — the web chat panel's endpoint (spec section 7, CONTRACTS.md
// "Chat panel contract"). GET hydrates the panel with recent history.
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { runAgent, recentlyTouched } from '@/lib/agent/chat';
import { newAccumulator, runTool } from '@/lib/agent/registry';
import type { ToolContext } from '@/lib/agent/types';
import type { ChatContent, ChatMessage, EntityType, PageContext } from '@/lib/types/db';

const ENTITY_TYPES: EntityType[] = ['goal', 'project', 'task', 'area', 'habit', 'none'];
/** Just an index like "2" (or with a leading/trailing space), answering a
 * pending disambiguation (spec section 7, "the next message '2' completes
 * the pending call"). */
const INDEX_RE = /^\s*(\d+)\s*$/;

function parsePageContext(value: unknown): PageContext | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.route !== 'string') return null;
  if (typeof v.entity_type !== 'string' || !ENTITY_TYPES.includes(v.entity_type as EntityType)) return null;
  return {
    route: v.route,
    entity_type: v.entity_type as EntityType,
    entity_id: typeof v.entity_id === 'string' ? v.entity_id : null,
    area_id: typeof v.area_id === 'string' ? v.area_id : null,
    filters: (v.filters as Record<string, unknown> | null) ?? null,
  };
}

async function insertMessage(
  role: 'user' | 'assistant',
  content: ChatContent,
  page_context: PageContext | null,
): Promise<number> {
  const { data, error } = await admin()
    .from('chat_messages')
    .insert({ channel: 'web', role, content, page_context })
    .select('id')
    .single();
  if (error) throw new Error(`chat_messages: ${error.message}`);
  return data.id as number;
}

async function lastAssistantPending(): Promise<ChatContent['pending'] | null> {
  const { data } = await admin()
    .from('chat_messages')
    .select('content')
    .eq('role', 'assistant')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  const content = data?.content as ChatContent | undefined;
  return content?.pending ?? null;
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { text, page_context, confirmed } = (body ?? {}) as {
    text?: unknown;
    page_context?: unknown;
    confirmed?: unknown;
  };
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: '"text" is required' }, { status: 400 });
  }
  const page = parsePageContext(page_context);
  if (!page) {
    return NextResponse.json({ error: '"page_context" is required: {route, entity_type, ...}' }, { status: 400 });
  }

  try {
    await insertMessage('user', { text }, page);

    // A bare number answers a pending disambiguation directly — the model is
    // not consulted (spec section 7: "the next message '2' completes the
    // pending call").
    const indexMatch = INDEX_RE.exec(text);
    const pending = indexMatch ? await lastAssistantPending() : null;
    if (indexMatch && pending) {
      const n = Number(indexMatch[1]);
      const choice = pending.options[n - 1];
      if (!choice) {
        const msg = `${n} isn't one of the options — pick 1-${pending.options.length}.`;
        const messageId = await insertMessage('assistant', { text: msg }, page);
        return NextResponse.json({ reply: msg, cards: [], pending, messageId });
      }
      const ctx: ToolContext = { page, channel: 'web', recent: await recentlyTouched(), now: new Date() };
      const acc = newAccumulator(Boolean(confirmed));
      const filledInput = { ...pending.input, [pending.field]: choice.id };
      const outcome = await runTool(pending.tool, filledInput, ctx, acc);
      const content: ChatContent = { text: outcome.message, cards: outcome.cards, pending: outcome.pending ?? null };
      const messageId = await insertMessage('assistant', content, page);
      return NextResponse.json({ reply: outcome.message, cards: outcome.cards ?? [], pending: outcome.pending ?? null, messageId });
    }

    const result = await runAgent({ text, page, channel: 'web', confirmed: Boolean(confirmed) });
    const content: ChatContent = { text: result.reply, cards: result.cards, pending: result.pending };
    const messageId = await insertMessage('assistant', content, page);
    return NextResponse.json({ reply: result.reply, cards: result.cards, pending: result.pending, messageId });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  try {
    const { data, error } = await admin()
      .from('chat_messages')
      .select('*')
      .order('id', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const messages = ((data ?? []) as ChatMessage[]).reverse();
    return NextResponse.json({ messages });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
