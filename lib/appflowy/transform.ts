// Turns an AppFlowy dump (scripts/appflowy/extract.py) into rows for LifeOS. Pure: no I/O, so it is unit-tested
// and the importer can show a dry run before anything is written.
import { randomUUID } from 'node:crypto';

type Cell = unknown;
export type AfRow = { id: string; _created_at?: number; _modified_at?: number; [field: string]: Cell };
export type AfDatabase = { database_id: string; views: string[]; fields: { name: string; type: string }[]; rows: AfRow[] };
export type AfDump = { databases: AfDatabase[] };

type Prio = 'P0' | 'P1' | 'P2' | 'P3';

export type PlanGoal = { notes_md: string; external_id: string; id: string; title: string; area: string | null; status: string; priority: Prio; start_date: string | null; target_date: string | null; created_at: string | null };
export type PlanProject = PlanGoal & { goal_id: string };
export type PlanTask = {
  notes_md: string; external_id: string; id: string; title: string; project_id: string | null; area: string | null; status: 'todo' | 'doing' | 'done';
  priority: Prio; due_date: string | null; due_at: string | null; created_at: string | null; completed_at: string | null;
};
export type PlanHabit = {
  external_id: string; name: string; time_of_day: 'morning' | 'afternoon' | 'evening' | 'any'; kind: 'boolean' | 'count';
  target_value: number; unit: string | null; days_of_week: number[] | null; area: string | null; created_at: string | null;
};
export type Plan = { goals: PlanGoal[]; projects: PlanProject[]; tasks: PlanTask[]; habits: PlanHabit[]; skipped: { kind: string; title: string; why: string }[]; catchAllGoalId: string | null };

export const CATCH_ALL_GOAL = 'Imported from AppFlowy (no goal)';

const IST_MS = 330 * 60_000;
/** Date-only AppFlowy values are midnight in either UTC or IST; adding 5:30 lands on the right IST date for both. */
export const istDateOf = (ts: number | null | undefined): string | null => (ts ? new Date(ts * 1000 + IST_MS).toISOString().slice(0, 10) : null);
const isoOf = (ts: number | null | undefined): string | null => (ts ? new Date(ts * 1000).toISOString() : null);

const str = (v: Cell): string => (typeof v === 'string' ? v.trim() : '');
const arr = (v: Cell): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : []);
type DateCell = { start: number | null; end: number | null; has_time: boolean } | null;
const dateCell = (v: Cell): DateCell => (v && typeof v === 'object' && 'start' in (v as object) ? (v as DateCell) : null);

export function pickArea(v: Cell): string | null {
  for (const a of arr(v)) {
    const n = a.trim().toLowerCase();
    if (n.startsWith('business')) return 'Business';
    if (n.startsWith('health')) return 'Health & Fitness';
    if (n.startsWith('relation')) return 'Relationships';
    if (n.startsWith('financ')) return 'Finances';
  }
  return null;
}

export function pickPriority(v: Cell, fallback: Prio): Prio {
  const p = str(v).toUpperCase();
  return p === 'P0' || p === 'P1' || p === 'P2' || p === 'P3' ? p : fallback;
}

/** Goals and projects: "Not Prioritised" parks the item (paused); everything else is active. */
export function entityStatus(v: Cell): 'active' | 'paused' | 'done' {
  const s = str(v).toLowerCase();
  if (s.startsWith('not prior')) return 'paused';
  if (s === 'done' || s === 'completed') return 'done';
  return 'active';
}

export function taskStatus(status: Cell, done: Cell): 'todo' | 'doing' | 'done' {
  const s = str(status).toLowerCase();
  if (done === true || s === 'completed' || s === 'done') return 'done';
  if (s === 'in progress') return 'doing';
  return 'todo';
}

const DAYS: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
/** "Daily" -> every day (null); "Mon to Fri", "Mon to saturday every week", "Mon, Wed, Fri" -> ISO weekdays. */
export function parseFrequency(v: Cell): number[] | null {
  const s = str(v).toLowerCase();
  if (!s || s.startsWith('daily') || s.includes('every day')) return null;
  const day = (w: string) => DAYS[w.trim().slice(0, 3)];
  const range = /\b([a-z]{3,9})\s*(?:to|-|–)\s*([a-z]{3,9})\b/.exec(s);
  if (range && day(range[1]) && day(range[2])) {
    const out: number[] = [];
    for (let d = day(range[1]); ; d = (d % 7) + 1) { out.push(d); if (d === day(range[2]) || out.length > 7) break; }
    return out;
  }
  const list = s.split(/[,\s/&]+/).map(day).filter((d): d is number => !!d);
  return list.length ? Array.from(new Set(list)).sort() : null;
}

/** AppFlowy habit names carry the creation date on a second line ("Gym\n18th Aug 26"). */
export const habitName = (v: Cell): string => str(v).split('\n')[0].trim();

/** A note counts only if some line, other than a heading, has text: empty bullets and bare headings are template scaffolding. */
export function realNotes(md: string | undefined): string {
  if (!md) return '';
  const hasText = md.split('\n').some((line) => {
    const l = line.trim();
    if (!l || l.startsWith('#') || l === '---') return false;
    return l.replace(/^(?:[-*>]\s*(?:\[[ x]\])?|\d+\.)\s*/i, '').replace(/```[a-z]*/gi, '').trim().length > 0;
  });
  return hasText ? md.trim() : '';
}

const isPlaceholderTitle = (t: string): string | null => {
  if (!t) return 'no title';
  if (/^\[.*template.*\]$/i.test(t)) return 'template row';
  return null;
};

export function buildPlan(dump: AfDump, newId: () => string = randomUUID, notes: Record<string, string> = {}): Plan {
  const find = (view: string) => dump.databases.find((d) => d.views.includes(view));
  const plan: Plan = { goals: [], projects: [], tasks: [], habits: [], skipped: [], catchAllGoalId: null };
  const goalDb = find('Goals'), projectDb = find('Projects'), taskDb = find('Tasks'), habitDb = find('Habits');

  const goalIds = new Map<string, string>(); // AppFlowy row id -> LifeOS id
  const seenGoal = new Set<string>();
  for (const r of goalDb?.rows ?? []) {
    const title = str(r['Goal']);
    const why = isPlaceholderTitle(title) ?? (title === 'New Goal' && !pickArea(r['Area']) ? 'untouched "New Goal" placeholder' : null);
    if (why) { plan.skipped.push({ kind: 'goal', title: title || '(blank)', why }); continue; }
    const key = `${title}|${pickArea(r['Area'])}`;
    if (seenGoal.has(key)) { plan.skipped.push({ kind: 'goal', title, why: 'duplicate' }); continue; }
    seenGoal.add(key);
    const d = dateCell(r['Deadline']);
    const id = newId();
    goalIds.set(r.id, id);
    plan.goals.push({
      notes_md: realNotes(notes[r.id]), external_id: r.id, id, title, area: pickArea(r['Area']), status: entityStatus(r['Status']), priority: pickPriority(r['Priority'], 'P1'),
      start_date: d?.end ? istDateOf(d.start) : null, target_date: istDateOf(d?.end ?? d?.start), created_at: isoOf(r._created_at),
    });
  }

  const projectIds = new Map<string, string>();
  const ensureCatchAll = (): string => {
    if (!plan.catchAllGoalId) {
      plan.catchAllGoalId = newId();
      plan.goals.push({ external_id: 'appflowy:catch-all-goal', id: plan.catchAllGoalId, notes_md: '', title: CATCH_ALL_GOAL, area: null, status: 'active', priority: 'P3', start_date: null, target_date: null, created_at: null });
    }
    return plan.catchAllGoalId;
  };
  for (const r of projectDb?.rows ?? []) {
    const title = str(r['Project']);
    const why = isPlaceholderTitle(title);
    if (why) { plan.skipped.push({ kind: 'project', title: title || '(blank)', why }); continue; }
    const goalRef = arr(r['Goals']).map((g) => goalIds.get(g)).find(Boolean);
    const d = dateCell(r['Deadline']);
    const id = newId();
    projectIds.set(r.id, id);
    plan.projects.push({
      notes_md: realNotes(notes[r.id]), external_id: r.id, id, title, area: pickArea(r['Area']), status: entityStatus(r['Status']), priority: pickPriority(r['Priority'], 'P1'),
      start_date: d?.end ? istDateOf(d.start) : null, target_date: istDateOf(d?.end ?? d?.start), created_at: isoOf(r._created_at),
      goal_id: goalRef ?? ensureCatchAll(),
    });
  }

  for (const r of taskDb?.rows ?? []) {
    const title = str(r['Task']);
    const why = isPlaceholderTitle(title);
    if (why) { plan.skipped.push({ kind: 'task', title: title || '(blank)', why }); continue; }
    const status = taskStatus(r['Status'], r['Done']);
    const d = dateCell(r['Deadline']);
    plan.tasks.push({
      notes_md: realNotes(notes[r.id]), external_id: r.id, id: newId(), title,
      project_id: arr(r['Project']).map((p) => projectIds.get(p)).find(Boolean) ?? null,
      area: pickArea(r['Area']), status, priority: pickPriority(r['Priority'], 'P2'),
      due_date: istDateOf(d?.start), due_at: d?.has_time && d.start ? isoOf(d.start) : null,
      created_at: isoOf(r._created_at), completed_at: status === 'done' ? isoOf(r._modified_at ?? r._created_at) : null,
    });
  }

  for (const r of habitDb?.rows ?? []) {
    const name = habitName(r['Name']);
    const why = isPlaceholderTitle(name);
    if (why) { plan.skipped.push({ kind: 'habit', title: name || '(blank)', why }); continue; }
    const target = typeof r['Target'] === 'number' ? (r['Target'] as number) : null;
    const type = str(r['Type']).toLowerCase();
    plan.habits.push({
      external_id: r.id, name,
      time_of_day: type.startsWith('morn') ? 'morning' : type.startsWith('after') ? 'afternoon' : type.startsWith('even') ? 'evening' : 'any',
      kind: target && target > 0 ? 'count' : 'boolean', target_value: target && target > 0 ? target : 1,
      unit: target && str(r['Metric']) ? str(r['Metric']) : null, days_of_week: parseFrequency(r['Frequency']),
      area: pickArea(r['Area']) ?? (/finance/i.test(arr(r['Area']).join(' ')) ? 'Finances' : null), created_at: isoOf(r._created_at),
    });
  }
  return plan;
}
