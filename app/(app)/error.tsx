'use client';
import { useEffect } from 'react';

/** Keeps the sidebar and chat alive when a page throws, and shows what to do next. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-xl space-y-3 p-8">
      <h1 className="text-lg font-semibold">This page hit an error</h1>
      <p className="text-sm text-muted-foreground">Nothing was lost. This usually means a database migration has not been run yet, or a service was briefly unavailable.</p>
      {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest} — search it in the Vercel function logs.</p>}
      <button type="button" onClick={reset} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Try again</button>
    </div>
  );
}
