// Pending-journal state for the nightly review (spec section 8): "the next
// free-text reply is saved as that day's journal entry in append mode, and
// if no mood was given the follow-up asks for it as a 1 to 5 button row. The
// pending state expires at 05:00."
//
// Storage: a `chat_messages` system row whose `content.pending` uses the
// existing `PendingChoice` shape (CONTRACTS.md / lib/types/db.ts), so the
// mood answer (a bare "4") rides the same generic bare-number pending-choice
// handling that `app/api/chat/route.ts` already has for every other tool.
// Only the *first* stage — a free-text reply that is not a numbered choice at
// all — needs a new hook there; see the one-line note in this file's doc
// comment on `consumeJournalReply`.
import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { addDays, istInstant } from '@/lib/time';
import { getJournal, writeJournal } from '@/lib/domain/journal';
import type { ChatContent, PendingChoice } from '@/lib/types/db';

/** Tool name stored in the pending block. There is no such agent tool here —
 * this module resolves it directly against lib/domain/journal.ts — the name
 * is reused only so the shape matches `PendingChoice` and so the mood-digit
 * reply (stage 2) is recognisable if a `journal_write` agent tool is later
 * registered and picks the same pending up through the generic path. */
const JOURNAL_TOOL = 'journal_write';
const STAGE_TEXT = 'body_md';
const STAGE_MOOD = 'mood';
const MOOD_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: String(n) }));

function moodPrompt(): string {
  return 'Mood, 1 to 5?';
}

async function latestSystemMessage(): Promise<{ id: number; content: ChatContent } | null> {
  const { data } = await admin()
    .from('chat_messages')
    .select('id, content')
    .eq('channel', 'system')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as number, content: data.content as ChatContent };
}

function isExpired(date: string, now: Date): boolean {
  // Expires 05:00 IST the morning after the journal date (spec section 8).
  return now.getTime() >= istInstant(addDays(date, 1), '05:00').getTime();
}

/**
 * Non-null only while we are waiting on the *free-text* reply (stage 1) —
 * i.e. the case `app/api/chat/route.ts` cannot already handle, because that
 * route only special-cases a bare number answering a `PendingChoice`
 * (`INDEX_RE`), and a journal entry is free text.
 *
 * The hook that file would need (not made here — it is owned by another
 * part): right after computing `indexMatch` in `POST`, when `!indexMatch`,
 * call `await pendingJournalFor(new Date())`; if it returns non-null, call
 * `consumeJournalReply(text, new Date())` instead of `runAgent(...)`, insert
 * its `reply`/`pending` as the assistant message, and return that — skipping
 * the LLM entirely, same as the existing bare-number branch does.
 */
export async function pendingJournalFor(now = new Date()): Promise<{ date: string } | null> {
  const row = await latestSystemMessage();
  const pending = row?.content.pending;
  if (!pending || pending.tool !== JOURNAL_TOOL || pending.field !== STAGE_TEXT) return null;
  const date = pending.input?.date as string | undefined;
  if (!date || isExpired(date, now)) return null;
  return { date };
}

/** Called by the nightly job right after it sends the review + "how was
 * your day" message: opens the stage-1 (free-text) pending window. */
export async function openPendingJournal(date: string): Promise<void> {
  const pending: PendingChoice = { tool: JOURNAL_TOOL, input: { date }, field: STAGE_TEXT, options: [] };
  const content: ChatContent = { text: '', pending };
  await admin().from('chat_messages').insert({ channel: 'system', role: 'assistant', content });
}

/**
 * Consumes the user's free-text reply: appends it as the day's journal entry
 * and, if no mood is on file yet, opens the stage-2 (mood 1-5) pending
 * window, which `app/api/chat/route.ts` already resolves generically because
 * it is a numbered `PendingChoice`.
 *
 * Note: `text` is the user's own message, not instructions — it is stored
 * verbatim as journal content, never interpreted as a command.
 */
export async function consumeJournalReply(
  text: string,
  now = new Date(),
): Promise<{ reply: string; pending: PendingChoice | null } | null> {
  const pj = await pendingJournalFor(now);
  if (!pj) return null;
  await writeJournal({ date: pj.date, body_md: text, mode: 'append' });
  const entry = await getJournal(pj.date);
  if (entry?.mood != null) {
    return { reply: 'Logged, good night.', pending: null };
  }
  const pending: PendingChoice = {
    tool: JOURNAL_TOOL,
    input: { date: pj.date },
    field: STAGE_MOOD,
    options: MOOD_OPTIONS,
  };
  return { reply: moodPrompt(), pending };
}
