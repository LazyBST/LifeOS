// The runnable agent core (spec section 7): shared by the web chat
// (`app/api/chat/route.ts`) and, in Part 2, the cron jobs that post
// proactive messages into the same conversation with `channel: 'system'`.
import 'server-only';
import { generateText, stepCountIs } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { env, MODELS } from '@/lib/env';
import { admin } from '@/lib/supabase/admin';
import { newAccumulator, toAiTools } from './registry';
import { buildSystemPrompt } from './prompt';
import type { ToolContext } from './types';
import type { ChatChannel, ChatContent, PageContext, PendingChoice, ToolResultCard } from '@/lib/types/db';

export type RunAgentInput = {
  text: string;
  page: PageContext;
  channel: ChatChannel;
  /** bypasses the >3-mutation confirmation gate (spec section 7 safety rules) */
  confirmed?: boolean;
};

export type RunAgentResult = {
  reply: string;
  cards: ToolResultCard[];
  pending: PendingChoice | null;
  actions: { tool: string; input: unknown }[];
};

const HREF_RE = /^\/(goals|projects|tasks)\/([0-9a-f-]{36})/i;
const HREF_TYPE: Record<string, string> = { goals: 'goal', projects: 'project', tasks: 'task' };

/** Seeds ctx.recent from the cards of recent assistant replies, so "it"/
 * "this" can resolve to something touched earlier in the conversation even
 * across separate /api/chat requests (spec section 7 context rules). */
export async function recentlyTouched(limit = 20): Promise<{ type: string; id: string; title: string }[]> {
  const { data } = await admin()
    .from('chat_messages')
    .select('role,content')
    .order('id', { ascending: false })
    .limit(limit);
  const out: { type: string; id: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const row of (data ?? []) as { role: string; content: ChatContent }[]) {
    if (row.role !== 'assistant' || !row.content?.cards) continue;
    for (const card of row.content.cards) {
      if (!card.href || seen.has(card.href)) continue;
      const m = HREF_RE.exec(card.href);
      if (!m) continue;
      seen.add(card.href);
      out.push({ type: HREF_TYPE[m[1]], id: m[2], title: card.title });
    }
  }
  return out;
}

function anthropicModel() {
  const anthropic = createAnthropic({ apiKey: env.anthropicApiKey });
  return anthropic(MODELS.chat);
}

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const now = new Date();
  const recent = await recentlyTouched();
  const ctx: ToolContext = { page: input.page, channel: input.channel, recent, now };
  const acc = newAccumulator(input.confirmed ?? false);
  const tools = toAiTools(ctx, acc);
  const system = await buildSystemPrompt({ page: input.page, now });

  const result = await generateText({
    model: anthropicModel(),
    system,
    prompt: input.text,
    tools,
    stopWhen: stepCountIs(8),
  });

  const reply = acc.pending ? (acc.pendingMessage ?? result.text) : result.text || 'Done.';
  return {
    reply,
    cards: acc.cards,
    pending: acc.pending,
    actions: acc.actions.map((a) => ({ tool: a.tool, input: a.input })),
  };
}
