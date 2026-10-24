import 'server-only';

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

/** Server-only secrets. Never import this from a client component. */
export const env = {
  get supabaseUrl() {
    return (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? need('SUPABASE_URL')).trim();
  },
  get supabaseAnonKey() {
    return (
      process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? need('SUPABASE_ANON_KEY')
    ).trim();
  },
  get supabaseServiceRoleKey() {
    return need('SUPABASE_SERVICE_ROLE_KEY');
  },
  get cronSecret() {
    return need('CRON_SECRET');
  },
  get ownerEmail() {
    return need('OWNER_EMAIL').toLowerCase();
  },
  get appUrl() {
    return process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  },
  optional(name: string) {
    return process.env[name];
  },
};

