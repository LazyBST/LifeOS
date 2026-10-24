import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { sendPush, type PushPayload } from '@/lib/push/send';
import { getConfig } from '@/lib/domain/config';
import { istParts } from '@/lib/time';
import type { ChatContent, ToolResultCard } from '@/lib/types/db';

export type Notification = PushPayload & {
  /** cards shown with the message in the in-app chat feed */
  cards?: ToolResultCard[];
  /** quiet hours 22:30-07:00 suppress the push but never the chat message
   *  (spec section 8); the nightly review and explicit reminders set this */
  bypassQuietHours?: boolean;
};

/** 22:30 to 07:00 IST (spec section 8). */
export function inQuietHours(now = new Date()): boolean {
  const { hour, minute } = istParts(now);
  const mins = hour * 60 + minute;
  return mins >= 22 * 60 + 30 || mins < 7 * 60;
}

/**
 * The single delivery path for every proactive message: it is always written
 * to the chat feed with `channel = 'system'` so it is visible even when a
 * push never arrives, and pushed to the installed PWA unless push is off or
 * it is quiet hours.
 */
export async function notify(n: Notification): Promise<{ messageId: number | null; push: string }> {
  const content: ChatContent = { text: `${n.title}\n${n.body}`.trim(), cards: n.cards };
  let messageId: number | null = null;
  const { data } = await admin()
    .from('chat_messages')
    .insert({ channel: 'system', role: 'assistant', content })
    .select('id')
    .single();
  messageId = (data?.id as number) ?? null;

  const cfg = await getConfig();
  if (!cfg.push_enabled) return { messageId, push: 'push disabled in settings' };
  if (inQuietHours() && !n.bypassQuietHours) return { messageId, push: 'suppressed: quiet hours' };

  const res = await sendPush({
    title: n.title,
    body: n.body,
    tag: n.tag,
    url: n.url,
    actions: n.actions,
    id: n.id,
  });
  return { messageId, push: res.skipped ?? `sent to ${res.sent} device(s)` };
}
