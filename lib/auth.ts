import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import { claimOwner, getConfig } from '@/lib/domain/config';

/**
 * Supabase client bound to the signed-in user's cookies. Used only for auth:
 * all data access goes through the service-role client in lib/supabase/admin.
 */
export async function supabaseSession() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // called from a Server Component: the middleware refreshes instead
        }
      },
    },
  });
}

export type Session = { userId: string; email: string };

/** The signed-in owner, or null. Rejects any account other than OWNER_EMAIL. */
export async function currentUser(): Promise<Session | null> {
  const sb = await supabaseSession();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user?.email) return null;
  if (user.email.toLowerCase() !== env.ownerEmail) {
    await sb.auth.signOut();
    return null;
  }
  const cfg = await getConfig(true);
  if (!cfg.owner_user_id) await claimOwner(user.id);
  else if (cfg.owner_user_id !== user.id) return null;
  return { userId: user.id, email: user.email };
}

export async function requireUser(): Promise<Session> {
  const u = await currentUser();
  if (!u) throw new Error('UNAUTHENTICATED');
  return u;
}
