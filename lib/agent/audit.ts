// Append-only log of mutating tool calls (spec section 7 step 4) plus the
// reversal used by `undo_last` (lib/agent/tools/undo.ts).
import 'server-only';
import { admin } from '@/lib/supabase/admin';
import type { AgentAction } from '@/lib/types/db';

export async function recordAction(tool: string, input: unknown, before: unknown, after: unknown): Promise<number> {
  const { data, error } = await admin()
    .from('agent_actions')
    .insert({ tool, input: input ?? null, before: before ?? null, after: after ?? null })
    .select('id')
    .single();
  if (error) throw new Error(`agent_actions: ${error.message}`);
  return data.id as number;
}

/** Latest not-yet-undone actions, most recent first. */
export async function latestActions(count: number): Promise<AgentAction[]> {
  const { data, error } = await admin()
    .from('agent_actions')
    .select('*')
    .is('undone_at', null)
    .order('id', { ascending: false })
    .limit(count);
  if (error) throw new Error(`agent_actions: ${error.message}`);
  return (data ?? []) as AgentAction[];
}

export async function markUndone(id: number): Promise<void> {
  const { error } = await admin()
    .from('agent_actions')
    .update({ undone_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`agent_actions: ${error.message}`);
}
