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

export type AuthCheck =
  | { ok: true; session: Session }
  | { ok: false; reason: 'no_session' | 'wrong_account' | 'owner_mismatch' };

/** Why a user is (not) allowed in: lets the login page say what actually failed. */
export async function checkUser(): Promise<AuthCheck> {
  const sb = await supabaseSession();
  // the signature is verified locally when the project signs with asymmetric keys; otherwise the auth server is asked
  const { data } = await sb.auth.getClaims();
  const user = data?.claims?.sub && data.claims.email ? { id: data.claims.sub, email: String(data.claims.email) } : null;
  if (!user) return { ok: false, reason: 'no_session' };
  if (user.email.trim().toLowerCase() !== env.ownerEmail.trim().toLowerCase()) {
    await sb.auth.signOut();
    return { ok: false, reason: 'wrong_account' };
  }
  let cfg = await getConfig(); // cached for 30s: one fewer database round trip on every page
  if (!cfg.owner_user_id) cfg = await getConfig(true);
  if (!cfg.owner_user_id) await claimOwner(user.id);
  else if (cfg.owner_user_id !== user.id) return { ok: false, reason: 'owner_mismatch' };
  return { ok: true, session: { userId: user.id, email: user.email } };
}

/** The signed-in owner, or null. Rejects any account other than OWNER_EMAIL. */
export async function currentUser(): Promise<Session | null> {
  const r = await checkUser();
  return r.ok ? r.session : null;
}

export async function requireUser(): Promise<Session> {
  const u = await currentUser();
  if (!u) throw new Error('UNAUTHENTICATED');
  return u;
}
