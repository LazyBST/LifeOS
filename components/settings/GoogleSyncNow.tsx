'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncGoogleNowAction, type GoogleSyncReport } from '@/app/actions/google';

/** One button that re-syncs calendar and Google Tasks and says plainly what happened. */
export function GoogleSyncNow({ lastError, lastOk, cached }: { lastError: string | null; lastOk: string | null; cached: number }) {
  const router = useRouter();
  const [report, setReport] = useState<GoogleSyncReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function sync(full = false) {
    setFailure(null);
    start(async () => {
      const r = await syncGoogleNowAction({ full });
      if (!r.ok) setFailure(r.error); else setReport(r.data);
      router.refresh();
    });
  }
  const problems = [...(report?.calendar.errors ?? []), ...(report?.tasks.error ? [`Google Tasks: ${report.tasks.error}`] : [])];
  return (
    <div className="space-y-2 rounded-lg border bg-card px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-medium">Sync</div>
        <span className="text-xs text-muted-foreground">
          {lastOk ? `Calendar last synced ${new Date(lastOk).toLocaleString()} · ${cached} events stored` : 'Calendar has not synced successfully yet'}
        </span>
        <button type="button" onClick={() => sync(false)} disabled={pending} className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {pending ? 'Syncing…' : 'Sync Google now'}
        </button>
        <button type="button" onClick={() => sync(true)} disabled={pending} className="rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50" title="Throw away the saved position and re-read the last and next month">
          Re-read everything
        </button>
      </div>
      {lastError && !report && <p className="text-xs text-destructive">Last calendar sync problem: {lastError}</p>}
      {failure && <p className="text-xs text-destructive">{failure}</p>}
      {report && (
        <div className="space-y-1 text-xs">
          {problems.length > 0 ? problems.map((p) => <p key={p} className="text-destructive">✕ {p}</p>) : <p className="text-emerald-600 dark:text-emerald-400">✓ No problems.</p>}
          <p className="text-muted-foreground">Calendar: {report.calendar.cached} events stored, {report.calendar.changed} changed. Pushed {report.outbox.pushed} task event{report.outbox.pushed === 1 ? '' : 's'} to Google.</p>
          <p className="text-muted-foreground">Google Tasks: {report.tasks.found} completed in the last 3 days, {report.tasks.matched} matched a habit, {report.tasks.pulled} new check-in{report.tasks.pulled === 1 ? '' : 's'}.</p>
          {report.tasks.unmatched.length > 0 && <p className="text-muted-foreground">No habit with these titles: {report.tasks.unmatched.join(', ')}. Rename the task or set the habit’s “Google Task title”.</p>}
          {report.tasks.unlinkedHabits.length > 0 && <p className="text-muted-foreground">Habits with no Google Task of the same name: {report.tasks.unlinkedHabits.join(', ')}.</p>}
        </div>
      )}
    </div>
  );
}
