import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">LifeOS</CardTitle>
          <CardDescription>Sign in to continue.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error === 'not_allowed' && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              That account is not allowed.
            </p>
          )}
          <Button size="lg" className="touch-target" render={<Link href="/auth/signin" />}>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
