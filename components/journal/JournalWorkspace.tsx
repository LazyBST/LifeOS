'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { JournalEditor } from '@/components/journal/JournalEditor';
import { summariseJournalsAction } from '@/app/actions/journal';
import { moodStats, moodTrend } from '@/lib/domain/journal-math';
import { formatDate } from '@/lib/time';
import type { JournalEntry } from '@/lib/types/db';

const EMOJI: Record<number, string> = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };
const tip = {
  background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--popover-foreground)',
};
const tick = { fill: 'var(--muted-foreground)', fontSize: 11 };

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-card p-4 ${className ?? ''}`}>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** Tiny markdown view for the summary: `##` headings and `-` bullets. */
function SummaryView({ md }: { md: string }) {
  return (
    <div className="space-y-1 text-sm">
      {md.split('\n').map((line, i) => {
        const l = line.trim();
        if (!l) return null;
        if (l.startsWith('#')) return <h3 key={i} className="pt-2 font-semibold">{l.replace(/^#+\s*/, '')}</h3>;
        if (/^[-*]\s/.test(l)) return <p key={i} className="pl-4 -indent-3">• {l.replace(/^[-*]\s+/, '').replace(/\*\*/g, '')}</p>;
        return <p key={i}>{l.replace(/\*\*/g, '')}</p>;
      })}
    </div>
  );
}

export function JournalWorkspace({ entries, today }: { entries: JournalEntry[]; today: string }) {
  const [date, setDate] = useState(today);
  const [query, setQuery] = useState('');
  const [summary, setSummary] = useState<{ md: string; n: number; model: boolean } | null>(null);
  const [pending, start] = useTransition();

  const byDate = useMemo(() => new Map(entries.map((e) => [e.entry_date, e])), [entries]);
  const current = byDate.get(date) ?? null;
  const trend = useMemo(() => moodTrend(entries), [entries]);
  const stats = useMemo(() => moodStats(entries), [entries]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => !q || e.body_md.toLowerCase().includes(q) || e.entry_date.includes(q));
  }, [entries, query]);

  function summarise() {
    start(async () => {
      const res = await summariseJournalsAction();
      if (!res.ok) { toast.error(res.error || 'Could not summarise'); return; }
      setSummary({ md: res.data.summary, n: res.data.entries, model: res.data.usedModel });
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Write or backfill an entry" className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 w-auto" aria-label="Entry date" />
          <Button size="sm" variant="outline" onClick={() => setDate(today)} disabled={date === today}>Today</Button>
          <span className="text-xs text-muted-foreground">
            {formatDate(date)} · {current ? 'editing existing entry' : 'new entry'}
          </span>
        </div>
        <JournalEditor key={`${date}:${current?.updated_at ?? ''}`} date={date} initialEntry={current} />
      </Card>

      <Card title="Summary of how life is going" className="lg:col-span-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={summarise} disabled={pending || entries.length === 0}>
            {pending ? 'Reading your journals…' : 'Summarise my journals'}
          </Button>
          <span className="text-xs text-muted-foreground">{entries.length} entries in total</span>
        </div>
        {summary && (
          <div className="mt-3">
            <SummaryView md={summary.md} />
            <p className="mt-2 text-xs text-muted-foreground">
              Based on {summary.n} entries{summary.model ? '' : ' (AI unavailable — basic summary shown)'}.
            </p>
          </div>
        )}
      </Card>

      <Card title="Mood trend">
        {trend.length === 0 ? (
          <p className="text-sm text-muted-foreground">No moods logged yet.</p>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d).slice(0, 6)} tick={tick} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={28} />
                <YAxis domain={[1, 5]} allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={24} />
                <Tooltip contentStyle={tip} labelFormatter={(d) => formatDate(String(d))} />
                <Line type="monotone" dataKey="mood" name="Mood" stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={1} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="avg7" name="7-day average" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Average mood by month">
        {stats.monthly.length === 0 ? (
          <p className="text-sm text-muted-foreground">No moods logged yet.</p>
        ) : (
          <>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthly} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tick={tick} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={16} />
                  <YAxis domain={[0, 5]} tick={tick} tickLine={false} axisLine={false} width={24} />
                  <Tooltip contentStyle={tip} formatter={(v) => [`${v}`, 'Average']} />
                  <Bar dataKey="average" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span>Average {stats.average}/5 over {stats.count} days</span>
              {stats.best && <span>Best: {formatDate(stats.best.date)} {EMOJI[stats.best.mood]}</span>}
              {stats.worst && <span>Lowest: {formatDate(stats.worst.date)} {EMOJI[stats.worst.mood]}</span>}
            </div>
            <div className="mt-2 flex gap-3 text-xs">
              {stats.distribution.map((n, i) => <span key={i}>{EMOJI[i + 1]} {n}</span>)}
            </div>
          </>
        )}
      </Card>

      <Card title="History" className="lg:col-span-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search entries…" className="mb-3 h-8 max-w-sm" />
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries found.</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((e) => (
              <li key={e.entry_date}>
                <button
                  type="button"
                  onClick={() => { setDate(e.entry_date); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="w-full rounded-lg border p-2.5 text-left hover:bg-muted/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{formatDate(e.entry_date)}</span>
                    {e.mood != null && <span className="text-sm">{EMOJI[e.mood] ?? e.mood}</span>}
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm">{e.body_md.trim() || 'No notes.'}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default JournalWorkspace;
