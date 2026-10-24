import 'server-only';
import webpush from 'web-push';
import { admin } from '@/lib/supabase/admin';
import type { PushSubscriptionRow } from '@/lib/types/db';

export type PushPayload = {
  title: string;
  body: string;
  /** collapses repeats of the same kind of notification */
  tag?: string;
  /** opened when the body of the notification is clicked */
  url?: string;
  /** buttons handled by /api/notify/action without the LLM (spec section 8) */
  actions?: { action: string; title: string }[];
  /** entity the action buttons act on */
  id?: string;
};

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:owner@example.com', pub, priv);
  configured = true;
  return true;
}

/**
 * Sends one payload to every registered device. Subscriptions the push
 * service rejects with 404 or 410 are deleted (spec section 8).
 * Never throws: a failed push must not break a cron job.
 */
export async function sendPush(payload: PushPayload): Promise<{ sent: number; removed: number; skipped: string | null }> {
  if (!configure()) return { sent: 0, removed: 0, skipped: 'VAPID keys not configured' };
  const { data, error } = await admin().from('push_subscriptions').select('*');
  if (error) return { sent: 0, removed: 0, skipped: `push_subscriptions: ${error.message}` };
  const subs = (data ?? []) as PushSubscriptionRow[];
  let sent = 0;
  let removed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin().from('push_subscriptions').delete().eq('id', s.id);
        removed += 1;
      } else {
        await admin()
          .from('push_subscriptions')
          .update({ last_error: e instanceof Error ? e.message : String(e) })
          .eq('id', s.id);
      }
    }
  }
  return { sent, removed, skipped: null };
}
