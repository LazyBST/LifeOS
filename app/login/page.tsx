import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const MESSAGES: Record<string, string> = {
  wrong_account: 'That Google account is not the owner (check OWNER_EMAIL).',
  not_allowed: 'That account is not allowed.',
  owner_mismatch:
    'Signed in, but a different user is already recorded as owner in app_config.owner_user_id.',
  exchange_failed:
    'Sign-in could not be completed (code exchange failed). Check the Supabase redirect URLs and try again.',
  signin_failed: 'Could not start Google sign-in. Check the Supabase Google provider settings.',
  no_session: 'No session was created after sign-in. Try again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const { error, detail } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">LifeOS</CardTitle>
          <CardDescription>Sign in to continue.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              {MESSAGES[error] ?? 'Sign-in failed.'}
              {detail ? ` (${detail})` : ''}
            </p>
          )}
          <Button size="lg" className="touch-target" nativeButton={false} render={<a href="/auth/signin" />}>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
