// The Pomodoro timer's sync engine (browser side, no React). One shared timer lives on the server with a version
// number. Every change is a small "intent" (pause, skip, a phase ran out, ...) that is applied here at once and then
// saved with the version it started from. If another device got there first the save is refused, the intents are
// replayed on top of what that device saved, and the save is tried again: nothing is silently overwritten, and an
// intent that no longer makes sense (skipping a phase another device already ended) is dropped.
import type { PomoTimer } from '@/lib/domain/pomodoro-math';

export type Doc = { timer: PomoTimer | null; ver: number; op?: string | null };
/** One round trip, for working out the server's clock: when it left (this device's clock), how long it took, and the server's time in the middle of it. */
export type TimeSample = { sentAt: number; rtt: number; netRtt: number; serverMid: number };
export type Api = {
  get(): Promise<{ doc: Doc; sample?: TimeSample } | null>;
  /** null: could not reach the server */
  save(timer: PomoTimer | null, baseVer: number, op: string): Promise<({ ok: true; ver: number } | { ok: false; doc: Doc }) & { sample?: TimeSample } | null>;
};

export type Outcome = { timer: PomoTimer | null; /** run once the server has accepted the change */ effects?: (() => void)[] };
export type Intent = {
  /** what the intent does to a timer; null = nothing to do (also how a replay drops it) */
  run: (t: PomoTimer | null, now: number) => Outcome | null;
  /** when it is replayed on a newer timer: none = always, run = same run only, phase = same phase only, snapshot = never */
  guard: 'none' | 'run' | 'phase' | 'snapshot';
  /** runs once, on the device where it happened, the first time it is applied */
  onLocal?: () => void;
};
type Entry = { intent: Intent; effects: (() => void)[]; runId?: string; phaseStartedAt?: number };

export type Hooks = {
  change?: (timer: PomoTimer | null, source: 'local' | 'remote') => void;
  persist?: (s: { timer: PomoTimer | null; ver: number; dirty: boolean }) => void;
};

export class PomoSync {
  timer: PomoTimer | null = null;
  ver = -1;
  hooks: Hooks = {};
  private entries: Entry[] = [];
  private skew = 0;
  private samples: TimeSample[] = [];
  private flushing = false;
  private again = false;
  constructor(private api: Api, private wall: () => number = Date.now) {}

  /** The server's time, as best this device can tell. */
  now(): number { return this.wall() + this.skew; }

  /** Take what this browser remembered; unsaved changes are saved on the next sync only if nobody else changed the timer since. */
  hydrate(timer: PomoTimer | null, ver: number, dirty: boolean): void {
    this.timer = timer; this.ver = ver; this.entries = [];
    if (dirty) this.entries.push({ intent: { guard: 'snapshot', run: () => ({ timer }) }, effects: [] });
  }

  /** The clock offset comes from the round trip that was quickest, because the quickest one is the most exact. */
  private sample(s?: TimeSample): void {
    if (!s || !(s.netRtt >= 0)) return;
    if (s.netRtt > 5000 && this.samples.length) return;
    this.samples = [...this.samples.slice(-9), s];
    const best = this.samples.reduce((a, b) => (b.netRtt < a.netRtt ? b : a));
    this.skew = best.serverMid - (best.sentAt + best.rtt / 2);
  }

  private guardOk(e: Entry, base: PomoTimer | null): boolean {
    switch (e.intent.guard) {
      case 'none': return true;
      case 'snapshot': return false;
      case 'run': return !!base && base.runId === e.runId;
      case 'phase': return !!base && base.runId === e.runId && base.phaseStartedAt === e.phaseStartedAt;
    }
  }

  /** Apply a change here now, then save it. */
  apply(intent: Intent): boolean {
    const before = this.timer;
    const out = intent.run(before, this.now());
    if (!out) return false;
    this.timer = out.timer;
    this.entries.push({ intent, effects: out.effects ?? [], runId: before?.runId, phaseStartedAt: before?.phaseStartedAt });
    intent.onLocal?.();
    this.hooks.change?.(this.timer, 'local');
    this.persist();
    void this.flush();
    return true;
  }

  private persist() { this.hooks.persist?.({ timer: this.timer, ver: this.ver, dirty: this.entries.length > 0 }); }

  /** Put what is waiting to be saved on top of the server's timer. */
  private rebase(doc: Doc): void {
    this.ver = doc.ver;
    let t = doc.timer;
    const kept: Entry[] = [];
    for (const e of this.entries) {
      if (!this.guardOk(e, t)) continue;
      const out = e.intent.run(t, this.now());
      if (!out) continue;
      const base = t;
      t = out.timer;
      kept.push({ ...e, effects: out.effects ?? [], runId: base?.runId, phaseStartedAt: base?.phaseStartedAt });
    }
    this.entries = kept;
    this.timer = t;
    this.hooks.change?.(t, 'remote');
    this.persist();
  }

  private async flush(): Promise<void> {
    if (this.flushing) { this.again = true; return; }
    this.flushing = true;
    try {
      do {
        this.again = false;
        for (let attempt = 0; attempt < 6 && this.entries.length; attempt++) {
          const k = this.entries.length;
          const op = Math.random().toString(36).slice(2) + this.wall().toString(36);
          const r = await this.api.save(this.timer, this.ver, op);
          if (!r) break; // offline: the changes wait for the next sync
          this.sample(r.sample);
          if (r.ok || r.doc.op === op) { // accepted (or it was accepted earlier and only the reply was lost)
            this.ver = r.ok ? r.ver : r.doc.ver;
            const done = this.entries.splice(0, k);
            this.persist();
            done.forEach((e) => e.effects.forEach((f) => { try { f(); } catch { /* a side effect must not break syncing */ } }));
          } else this.rebase(r.doc);
        }
      } while (this.again);
    } finally { this.flushing = false; }
  }

  /** Look at the server: follow what another device did, and send anything still waiting. False if it could not be reached. */
  async sync(): Promise<boolean> {
    const r = await this.api.get();
    if (!r) return false;
    this.sample(r.sample);
    if (this.flushing) return true; // a save is on its way; its answer settles things
    if (r.doc.ver !== this.ver) {
      if (this.entries.length) this.rebase(r.doc);
      else {
        this.ver = r.doc.ver; this.timer = r.doc.timer;
        this.hooks.change?.(this.timer, 'remote');
        this.persist();
      }
    }
    if (this.entries.length) void this.flush();
    return true;
  }
}
