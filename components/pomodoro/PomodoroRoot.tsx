'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getCalendarWeekAction } from '@/app/actions/calweek';
import { logPomodoroSegmentAction } from '@/app/actions/pomodoro';
import { advance, clock, elapsedMs, endInstant, pause, phaseMs, remainingMs, resume, segmentOf, startRun, type PomoConfig, type PomoTimer, type Segment } from '@/lib/domain/pomodoro-math';
import { istDate, istParts } from '@/lib/time';
import { weekStart } from '@/lib/domain/lifecal-math';
import type { WeekBlock } from '@/lib/domain/calweek';
import { FocusDay } from './FocusDay';

const LS_TIMER = 'lifeos:pomo:timer', LS_UI = 'lifeos:pomo:ui', LS_CFG = 'lifeos:pomo:cfg', LS_LOGGED = 'lifeos:pomo:logged';
const MIN = 60_000;
const DEFAULT_CFG: PomoConfig = { workMin: 25, breakMin: 5, repeats: null };
const PRESETS: [number, number][] = [[15, 3], [25, 5], [50, 10], [90, 20]];

type View = 'mini' | 'card' | 'full';
type Current = { title: string; sub: string | null };

const minutesOf = (iso: string) => { const p = istParts(new Date(iso)); return p.hour * 60 + p.minute; };
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** What the calendar says you should be doing right now: a task first, then a habit, then an event; otherwise what is next. */
function pickCurrent(blocks: WeekBlock[], now: number): Current {
  const today = istDate(new Date(now));
  const mine = blocks.filter((b) => istParts(new Date(b.start)).date === today && !b.done);
  const order = { task: 0, habit: 1, event: 2 } as const;
  const on = mine.filter((b) => Date.parse(b.start) <= now && Date.parse(b.end) > now).sort((a, b) => order[a.kind] - order[b.kind]);
  if (on[0]) return { title: `${on[0].habit?.emoji ? `${on[0].habit.emoji} ` : ''}${on[0].title}`, sub: `${hm(minutesOf(on[0].start))}–${hm(minutesOf(on[0].end))} on your calendar` };
  const next = mine.filter((b) => Date.parse(b.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
  return next ? { title: 'Focus time', sub: `Next on your calendar: ${next.title} at ${hm(minutesOf(next.start))}` } : { title: 'Focus time', sub: 'Nothing scheduled right now' };
}

const PHASE = {
  work: { name: 'Focus', grad: 'from-rose-500 via-orange-500 to-amber-500', solid: '#f43f5e', ring: '#fb7185' },
  break: { name: 'Break', grad: 'from-emerald-500 via-teal-500 to-cyan-500', solid: '#10b981', ring: '#34d399' },
} as const;

function Ring({ size, stroke, pct, color, children }: { size: number; stroke: number; pct: number; color: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, pct)))} style={{ transition: 'stroke-dashoffset 0.3s linear' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

const Icon = {
  clock: <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6M12 2v3" /></svg>,
  pause: <svg viewBox="0 0 24 24" className="size-6" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>,
  play: <svg viewBox="0 0 24 24" className="size-6" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>,
  skip: <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><path d="M5 5.5v13l9-6.5zM16 5h3v14h-3z" /></svg>,
  stop: <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>,
  expand: <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>,
  shrink: <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></svg>,
  down: <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>,
  close: <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
};

/** The Pomodoro timer: an icon on every screen that becomes a running timer, a card and a full-screen focus view. */
export function PomodoroRoot() {
  const [timer, setTimer] = useState<PomoTimer | null>(null);
  const [view, setView] = useState<View>('mini');
  const [hidden, setHidden] = useState(false);
  const [setup, setSetup] = useState(false);
  const [cfg, setCfg] = useState<PomoConfig>(DEFAULT_CFG);
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState<Current>({ title: 'Focus time', sub: null });
  const [statsKey, setStatsKey] = useState(0);
  const [ready, setReady] = useState(false);
  const timerRef = useRef<PomoTimer | null>(null);
  const currentRef = useRef(current);
  const audio = useRef<AudioContext | null>(null);
  const baseTitle = useRef<string | null>(null);
  currentRef.current = current;

  const commit = useCallback((t: PomoTimer | null) => {
    timerRef.current = t;
    setTimer(t);
    try { if (t) localStorage.setItem(LS_TIMER, JSON.stringify(t)); else localStorage.removeItem(LS_TIMER); } catch {}
  }, []);

  // restore from this browser; other tabs keep this one in step
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_TIMER);
      if (raw) { const t = JSON.parse(raw) as PomoTimer; timerRef.current = t; setTimer(t); }
      const ui = JSON.parse(localStorage.getItem(LS_UI) ?? '{}') as { hidden?: boolean; view?: View };
      if (ui.hidden) setHidden(true);
      if (ui.view) setView(ui.view);
      const c = JSON.parse(localStorage.getItem(LS_CFG) ?? 'null') as PomoConfig | null;
      if (c && c.workMin > 0) setCfg(c);
    } catch {}
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_TIMER) { const t = e.newValue ? (JSON.parse(e.newValue) as PomoTimer) : null; timerRef.current = t; setTimer(t); }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => { if (ready) try { localStorage.setItem(LS_UI, JSON.stringify({ hidden, view })); } catch {} }, [hidden, view, ready]);

  // other parts of the app (menu entries) can show, hide or open the timer
  useEffect(() => {
    const h = (e: Event) => {
      const a = (e as CustomEvent<string>).detail;
      if (a === 'hide') setHidden(true);
      else { setHidden(false); if (a === 'open' && !timerRef.current) setSetup(true); }
    };
    window.addEventListener('lifeos:pomodoro', h);
    return () => window.removeEventListener('lifeos:pomodoro', h);
  }, []);

  // what the calendar says you should be doing: refreshed while the timer is on screen
  const active = !!timer && timer.status !== 'done';
  const watch = !hidden && (active || setup || view === 'full');
  useEffect(() => {
    if (!watch) return;
    let stop = false;
    const load = async () => {
      const r = await getCalendarWeekAction(weekStart(istDate()));
      if (!stop && r.ok) setCurrent(pickCurrent(r.data.blocks, Date.now()));
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [watch]);

  const log = useCallback((seg: Segment) => {
    if (seg.actual_sec < 5 && !seg.completed) return; // an accidental tap is not a session
    const key = `${seg.run_id}:${seg.started_at}:${seg.kind}`;
    try { if (localStorage.getItem(LS_LOGGED) === key) return; localStorage.setItem(LS_LOGGED, key); } catch {}
    void logPomodoroSegmentAction(seg).then((r) => { if (!r.ok) toast.error(r.error); else setStatsKey((k) => k + 1); });
  }, []);

  const beep = useCallback((notes: number[]) => {
    try {
      const ctx = audio.current ?? new AudioContext();
      audio.current = ctx;
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.22);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.22 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.22 + 0.2);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.22); o.stop(ctx.currentTime + i * 0.22 + 0.22);
      });
    } catch {}
    try { navigator.vibrate?.([200, 100, 200]); } catch {}
  }, []);

  const announce = useCallback((t: PomoTimer) => {
    const text = t.status === 'done' ? 'All sessions done. Great work!' : t.phase === 'break' ? 'Focus session done. Take a break.' : 'Break over. Back to focus.';
    beep(t.phase === 'break' && t.status !== 'done' ? [660, 880] : [880, 660, 520]);
    toast(text);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('LifeOS Pomodoro', { body: text }); } catch {}
  }, [beep]);

  // the clock: every tick looks at the timestamps, so a sleeping tab cannot drift
  useEffect(() => {
    if (!timer || timer.status !== 'running') return;
    const id = setInterval(() => {
      const t = timerRef.current, n = Date.now();
      setNow(n);
      if (!t || t.status !== 'running' || remainingMs(t, n) > 0) return;
      const end = endInstant(t);
      if (n - end > 5 * MIN) { // the app was closed or asleep through the end: close the run rather than invent sessions
        log(segmentOf(t, end, true));
        commit({ ...t, status: 'done' });
        toast('The timer finished while you were away.');
        return;
      }
      const r = advance(t, end, t.phase === 'work' ? 'Break' : currentRef.current.title, true);
      log(r.segment);
      commit({ ...r.next, label: r.next.phase === 'work' ? currentRef.current.title : 'Break' });
      announce(r.next);
    }, 250);
    return () => clearInterval(id);
  }, [timer?.status, timer?.phaseStartedAt, timer?.runId, commit, log, announce]); // eslint-disable-line react-hooks/exhaustive-deps

  // the tab title shows the time, so it can be glanced at from another tab
  useEffect(() => {
    if (timer && timer.status !== 'done') {
      if (baseTitle.current === null) baseTitle.current = document.title;
      document.title = `${clock(remainingMs(timer, now))} · ${PHASE[timer.phase].name}${timer.status === 'paused' ? ' (paused)' : ''}`;
    } else if (baseTitle.current !== null) { document.title = baseTitle.current; baseTitle.current = null; }
  }, [timer, now]);

  // keep the screen awake in the full-screen view
  useEffect(() => {
    if (view !== 'full' || !active) return;
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    return () => { void lock?.release().catch(() => undefined); };
  }, [view, active]);
  useEffect(() => {
    if (view !== 'full') return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setView('card'); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [view]);

  function start(c: PomoConfig) {
    setCfg(c);
    try { localStorage.setItem(LS_CFG, JSON.stringify(c)); } catch {}
    try { audio.current = audio.current ?? new AudioContext(); void audio.current.resume(); } catch {}
    try { if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission(); } catch {}
    commit(startRun(c, Date.now(), crypto.randomUUID(), currentRef.current.title));
    setNow(Date.now());
    setSetup(false);
    setView('card');
    setHidden(false);
  }
  const togglePause = () => { const t = timerRef.current, n = Date.now(); if (t) { commit(t.status === 'running' ? pause(t, n) : resume(t, n)); setNow(n); } };
  const skip = () => {
    const t = timerRef.current, n = Date.now();
    if (!t || t.status === 'done') return;
    const r = advance(t, n, t.phase === 'work' ? 'Break' : currentRef.current.title, false);
    log(r.segment);
    commit({ ...r.next, label: r.next.phase === 'work' ? currentRef.current.title : 'Break' });
    setNow(n);
  };
  const stop = () => {
    const t = timerRef.current;
    if (t && t.status !== 'done') log(segmentOf(t, Date.now(), false));
    commit(null);
    setView('mini');
  };

  const mem = useMemo(() => {
    if (!timer) return null;
    const total = phaseMs(timer), left = remainingMs(timer, now);
    return { left, pct: total ? 1 - left / total : 0, c: PHASE[timer.phase], elapsed: elapsedMs(timer, now) };
  }, [timer, now]);

  if (!ready) return null;
  const done = timer?.status === 'done';
  const paused = timer?.status === 'paused';
  const heading = timer?.phase === 'break' ? 'Take a breather' : current.title;
  const sessionText = timer ? (timer.phase === 'work' ? `Focus ${timer.cycle}${timer.cfg.repeats ? ` of ${timer.cfg.repeats}` : ''}` : `Break after session ${timer.cycle}`) : '';
  const fab = 'fixed right-4 bottom-20 z-40 md:right-20 md:bottom-4';

  const controls = (big: boolean) => timer && !done && (
    <div className="flex items-center justify-center gap-3">
      <button type="button" onClick={skip} className={`flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 ${big ? 'size-12' : 'size-10'}`} aria-label={timer.phase === 'work' ? 'Skip to break' : 'Skip break'} title="Skip this part">{Icon.skip}</button>
      <button type="button" onClick={togglePause} className={`flex items-center justify-center rounded-full bg-white shadow-lg ${big ? 'size-20' : 'size-14'}`} style={{ color: mem?.c.solid }} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? Icon.play : Icon.pause}</button>
      <button type="button" onClick={stop} className={`flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 ${big ? 'size-12' : 'size-10'}`} aria-label="Stop" title="Stop the timer">{Icon.stop}</button>
    </div>
  );

  return (
    <>
      {/* nothing running: the clock icon */}
      {!hidden && !timer && (
        <button type="button" onClick={() => setSetup(true)} aria-label="Start a Pomodoro" title="Pomodoro timer" className={`${fab} flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105`}>{Icon.clock}</button>
      )}

      {/* running: the small round timer */}
      {!hidden && timer && mem && view === 'mini' && (
        <button type="button" onClick={() => setView('card')} aria-label="Open the timer" className={`${fab} rounded-full shadow-xl transition-transform hover:scale-105 ${paused ? 'opacity-90' : ''}`} style={{ background: paused ? '#64748b' : mem.c.solid }}>
          {done ? <span className="flex size-16 items-center justify-center text-2xl text-white">✓</span> : (
            <Ring size={64} stroke={4} pct={mem.pct} color="#fff">
              <span className="text-[13px] font-bold tabular-nums text-white">{paused ? '❚❚' : clock(mem.left)}</span>
            </Ring>
          )}
        </button>
      )}

      {/* running: the card */}
      {!hidden && timer && mem && view === 'card' && (
        <div className={`fixed right-3 bottom-20 left-3 z-[45] overflow-hidden rounded-3xl bg-gradient-to-br text-white shadow-2xl sm:left-auto sm:w-80 md:right-4 md:bottom-20 ${paused ? 'from-slate-500 via-slate-600 to-slate-700' : mem.c.grad}`}>
          <div className="flex items-center gap-1 px-4 pt-3 text-[11px] font-semibold uppercase tracking-widest text-white/85">
            <span className="flex-1">{done ? 'Finished' : `${paused ? 'Paused · ' : ''}${sessionText}`}</span>
            <button type="button" onClick={() => setView('full')} className="rounded-full p-1.5 hover:bg-white/20" aria-label="Full screen" title="Full screen">{Icon.expand}</button>
            <button type="button" onClick={() => setView('mini')} className="rounded-full p-1.5 hover:bg-white/20" aria-label="Minimise" title="Minimise">{Icon.down}</button>
            <button type="button" onClick={() => setHidden(true)} className="rounded-full p-1.5 hover:bg-white/20" aria-label="Hide the timer" title="Hide (keeps running)">{Icon.close}</button>
          </div>
          <div className="px-5 pt-2 pb-5 text-center">
            <h2 className="line-clamp-2 min-h-[3.2rem] text-xl leading-tight font-extrabold tracking-tight">{done ? 'Great work!' : heading}</h2>
            {!done && current.sub && timer.phase === 'work' && <p className="mt-0.5 line-clamp-1 text-xs text-white/80">{current.sub}</p>}
            {done ? (
              <div className="mt-3 space-y-3"><p className="text-sm text-white/90">All your sessions are done.</p><button type="button" onClick={() => commit(null)} className="rounded-full bg-white px-5 py-2 text-sm font-semibold" style={{ color: '#f43f5e' }}>Close</button></div>
            ) : (
              <>
                <div className="my-3 text-6xl font-black tracking-tight tabular-nums">{clock(mem.left)}</div>
                <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white" style={{ width: `${mem.pct * 100}%`, transition: 'width 0.3s linear' }} /></div>
                {controls(false)}
              </>
            )}
          </div>
        </div>
      )}

      {/* running: full screen */}
      {!hidden && timer && mem && view === 'full' && (
        <div className={`fixed inset-0 z-[70] overflow-y-auto bg-gradient-to-br text-white ${paused ? 'from-slate-600 via-slate-700 to-slate-900' : mem.c.grad}`}>
          <div className="flex items-center gap-1 px-4 pt-4 sm:px-6">
            <span className="flex-1 text-xs font-bold uppercase tracking-[0.3em] text-white/85">{done ? 'Finished' : `${paused ? 'Paused · ' : ''}${sessionText}`}</span>
            <button type="button" onClick={() => setView('card')} className="rounded-full p-2 hover:bg-white/20" aria-label="Exit full screen" title="Exit full screen (Esc)">{Icon.shrink}</button>
            <button type="button" onClick={() => { setView('mini'); setHidden(true); }} className="rounded-full p-2 hover:bg-white/20" aria-label="Hide the timer" title="Hide (keeps running)">{Icon.close}</button>
          </div>
          <div className="mx-auto flex max-w-3xl flex-col items-center px-5 pb-16 text-center">
            <h1 className="mt-6 mb-2 max-w-2xl text-4xl leading-tight font-black tracking-tight drop-shadow sm:text-6xl">{done ? 'Great work!' : heading}</h1>
            {!done && current.sub && timer.phase === 'work' && <p className="mb-6 text-base text-white/85 sm:text-lg">{current.sub}</p>}
            {done ? <button type="button" onClick={() => { commit(null); setView('mini'); }} className="mt-8 rounded-full bg-white px-8 py-3 text-lg font-bold text-rose-600">Close</button> : (
              <>
                <div className="my-4"><Ring size={300} stroke={14} pct={mem.pct} color="#fff"><span className="text-7xl font-black tracking-tight tabular-nums drop-shadow sm:text-8xl">{clock(mem.left)}</span></Ring></div>
                <div className="mb-8 flex items-center gap-2">
                  {(timer.cfg.repeats ? Array.from({ length: timer.cfg.repeats }, (_, i) => i + 1) : Array.from({ length: Math.max(4, timer.cycle) }, (_, i) => i + 1)).map((n) => (
                    <span key={n} className={`size-2.5 rounded-full ${n < timer.cycle || (n === timer.cycle && timer.phase === 'break') ? 'bg-white' : n === timer.cycle ? 'bg-white/90 ring-2 ring-white/50' : 'bg-white/30'}`} />
                  ))}
                  {!timer.cfg.repeats && <span className="text-xs text-white/80">until you stop</span>}
                </div>
                {controls(true)}
              </>
            )}
            <div className="mt-12 w-full rounded-3xl bg-black/20 p-5 text-left backdrop-blur"><FocusDay light refreshKey={statsKey} /></div>
          </div>
        </div>
      )}

      {/* start a timer */}
      <Dialog open={setup} onOpenChange={setSetup}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start a Pomodoro</DialogTitle></DialogHeader>
          <SetupForm initial={cfg} heading={current} onStart={start} onHide={() => { setSetup(false); setHidden(true); }} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function SetupForm({ initial, heading, onStart, onHide }: { initial: PomoConfig; heading: Current; onStart: (c: PomoConfig) => void; onHide: () => void }) {
  const [work, setWork] = useState(String(initial.workMin));
  const [brk, setBrk] = useState(String(initial.breakMin));
  const [forever, setForever] = useState(initial.repeats === null);
  const [times, setTimes] = useState(String(initial.repeats ?? 4));
  const w = Number(work), b = Number(brk), r = Number(times);
  const problem = !(w >= 1 && w <= 180) ? 'Work sessions can be 1 to 180 minutes.' : !(b >= 0 && b <= 60) ? 'Breaks can be 0 to 60 minutes.' : !forever && !(r >= 1 && r <= 50) ? 'Repeat 1 to 50 times.' : null;
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl bg-muted/60 px-3 py-2"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Working on</div><div className="font-semibold">{heading.title}</div>{heading.sub && <div className="text-xs text-muted-foreground">{heading.sub}</div>}</div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([pw, pb]) => (
          <button key={pw} type="button" onClick={() => { setWork(String(pw)); setBrk(String(pb)); }} className={`rounded-full border px-3 py-1 text-xs ${Number(work) === pw && Number(brk) === pb ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted'}`}>{pw} / {pb}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1"><span className="font-medium">How long is a work session?</span><div className="flex items-center gap-2"><Input type="number" min={1} max={180} value={work} onChange={(e) => setWork(e.target.value)} /><span className="text-muted-foreground">min</span></div></label>
        <label className="space-y-1"><span className="font-medium">How long is a break?</span><div className="flex items-center gap-2"><Input type="number" min={0} max={60} value={brk} onChange={(e) => setBrk(e.target.value)} /><span className="text-muted-foreground">min</span></div></label>
      </div>
      <div className="space-y-2">
        <div className="font-medium">How many times? <span className="font-normal text-muted-foreground">(optional)</span></div>
        <div className="flex rounded-lg bg-muted p-0.5 text-xs">
          <button type="button" onClick={() => setForever(true)} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${forever ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Until I stop</button>
          <button type="button" onClick={() => setForever(false)} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${!forever ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Repeat a set number</button>
        </div>
        {!forever && <div className="flex items-center gap-2"><Input type="number" min={1} max={50} value={times} onChange={(e) => setTimes(e.target.value)} className="w-24" /><span className="text-muted-foreground">work sessions</span></div>}
      </div>
      {problem && <p className="text-xs text-red-600">{problem}</p>}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onHide} className="text-xs text-muted-foreground underline">Hide the timer button</button>
        <button type="button" disabled={!!problem} onClick={() => onStart({ workMin: w, breakMin: b, repeats: forever ? null : r })} className="rounded-xl bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-50">Start</button>
      </div>
    </div>
  );
}
