'use client';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser client, used for auth only (sign in / sign out / session).
 * All data access goes through server actions and /api routes so the browser
 * talks to one domain (spec section 3, VPN constraint).
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
