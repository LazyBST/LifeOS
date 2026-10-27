import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Refreshes the Supabase auth cookie on every request and redirects
 * unauthenticated requests to /login. Runs on the Edge runtime, so this
 * file must never import lib/auth.ts (server-only) or anything that pulls
 * in the service-role client. The owner-email check lives in lib/auth.ts
 * and runs again in app/(app)/layout.tsx; middleware only checks that a
 * session cookie exists.
 */

const PUBLIC_PATHS = [
  '/login',
  '/auth',
  '/api/cron',
  '/api/notify',
  '/manifest.webmanifest',
  '/sw.js',
  '/icons',
  '/favicon.ico',
];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith('/_next')) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // verifies the token's signature here (no round trip to Supabase) when the project uses
  // asymmetric signing keys, and asks the auth server otherwise; either way an unverified cookie is not trusted
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub && !isPublic(request.nextUrl.pathname)) {
    // API routes answer with JSON themselves (they call requireUser), so a
    // redirect here would hand fetch() an HTML login page instead of a 401.
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
