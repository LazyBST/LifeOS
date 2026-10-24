/**
 * Imports an AppFlowy dump into LifeOS.
 *
 *   python3 scripts/appflowy/extract.py <copy of the AppFlowy user folder> data/appflowy/dump.json
 *   npm run import:appflowy               # dry run: shows what would happen, writes nothing
 *   npm run import:appflowy -- --apply    # writes to the database in .env.local
 *   npm run import:appflowy -- --apply --reset   # first DELETES all existing content (see RESET_TABLES), then imports
 *
 * Safe to re-run: rows are matched by external_id, so nothing is duplicated.
 * Needs migration 0013 (external_id columns) and a service-role key in .env.local.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { buildPlan, type AfDump } from '../../lib/appflowy/transform';

const apply = process.argv.includes('--apply');
const reset = process.argv.includes('--reset');
const dumpPath = process.argv.find((a) => a.endsWith('.json')) ?? 'data/appflowy/dump.json';
if (!existsSync(dumpPath)) { console.error(`No dump at ${dumpPath}. Run scripts/appflowy/extract.py first.`); process.exit(1); }

const notesPath = dumpPath.replace(/dump\.json$/, 'notes.json');
const notes = existsSync(notesPath) ? (JSON.parse(readFileSync(notesPath, 'utf8')) as Record<string, string>) : {};
const plan = buildPlan(JSON.parse(readFileSync(dumpPath, 'utf8')) as AfDump, undefined, notes);

console.log(`\nPlan from ${dumpPath}`);
console.log(`  goals    ${plan.goals.length}${plan.catchAllGoalId ? ' (includes one catch-all goal for projects that had none)' : ''}`);
console.log(`  projects ${plan.projects.length}`);
console.log(`  tasks    ${plan.tasks.length} (${plan.tasks.filter((t) => t.status === 'done').length} done, ${plan.tasks.filter((t) => !t.project_id).length} without a project)`);
console.log(`  habits   ${plan.habits.length}`);
console.log(`  notes    ${[...plan.goals, ...plan.projects, ...plan.tasks].filter((x) => x.notes_md).length} pages with text${existsSync(notesPath) ? '' : ' (no notes.json: run scripts/appflowy/extract_notes.py to include page bodies)'}`);
console.log(`  skipped  ${plan.skipped.length}`);
for (const s of plan.skipped) console.log(`    - ${s.kind}: ${s.title.slice(0, 50)} (${s.why})`);

if (!apply) {
  console.log('\nDry run only. Add --apply to write these rows' + (reset ? ' (and --reset to wipe existing content first: shown below once you run with --apply)' : '') + '.\n');
  process.exit(0);
}

for (const f of ['.env.local', '.env']) if (existsSync(f)) { process.loadEnvFile(f); break; }
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local'); process.exit(1); }
const sb = createClient(url.trim(), key.trim(), { auth: { persistSession: false } });

/**
 * Everything the app has stored for you, in an order that respects foreign keys. Kept: app_config (times, owner),
 * areas, statuses, categories, Google tokens and push subscriptions, job history and the calendar edit log.
 * Each entry is [table, a filter that matches every row].
 */
const RESET_TABLES: [string, (q: ReturnType<typeof sb.from>) => unknown][] = [
  ['task_events', (q) => q.delete().gte('id', 0)],
  ['agent_actions', (q) => q.delete().gte('id', 0)],
  ['chat_messages', (q) => q.delete().gte('id', 0)],
  ['gcal_outbox', (q) => q.delete().gte('id', 0)],
  ['sync_conflicts', (q) => q.delete().gte('id', 0)],
  ['gcal_links', (q) => q.delete().neq('google_event_id', '')],
  ['deadline_changes', (q) => q.delete().gte('id', 0)],
  ['daily_priorities', (q) => q.delete().gte('position', 0)],
  ['daily_plans', (q) => q.delete().gte('plan_date', '1900-01-01')],
  ['reminders', (q) => q.delete().gte('remind_at', '1900-01-01')],
  ['habit_checkins', (q) => q.delete().gte('checkin_date', '1900-01-01')],
  ['journal_entries', (q) => q.delete().gte('entry_date', '1900-01-01')],
  ['reading_log', (q) => q.delete().gte('read_on', '1900-01-01')],
  ['book_links', (q) => q.delete().gte('created_at', '1900-01-01')],
  ['books', (q) => q.delete().gte('created_at', '1900-01-01')],
  ['transactions', (q) => q.delete().gte('created_at', '1900-01-01')],
  ['accounts', (q) => q.delete().gte('opening_balance', -1e12)],
  ['habits', (q) => q.delete().gte('created_at', '1900-01-01')],
  ['tasks', (q) => q.delete().gte('created_at', '1900-01-01')],
  ['projects', (q) => q.delete().gte('created_at', '1900-01-01')],
  ['goals', (q) => q.delete().gte('created_at', '1900-01-01')],
];

async function resetContent(): Promise<void> {
  console.log('\nRESET: this permanently deletes the following rows from', new URL(url!).host);
  const counts: [string, number][] = [];
  for (const [t] of RESET_TABLES) {
    const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
    counts.push([t, error ? 0 : count ?? 0]);
  }
  for (const [t, n] of counts) console.log(`  ${t.padEnd(18)} ${n}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nType DELETE to wipe these tables and import, anything else to stop: ');
  rl.close();
  if (answer.trim() !== 'DELETE') { console.log('Stopped. Nothing was changed.'); process.exit(0); }
  for (const [t, filter] of RESET_TABLES) {
    const { error } = (await filter(sb.from(t))) as { error: { message: string } | null };
    if (error && !/does not exist|schema cache/i.test(error.message)) throw new Error(`reset ${t}: ${error.message}`);
  }
  // a fresh LifeOS calendar will be created on the next Google sync, so old events cannot come back as tasks
  await sb.from('gcal_calendars').delete().eq('role', 'lifeos_rw');
  await sb.from('gcal_calendars').update({ sync_token: null }).eq('role', 'primary_ro');
  await sb.from('accounts').insert({ name: 'Cash', opening_balance: 0, is_default: true });
  console.log('Wiped. Created an empty default account "Cash".');
}

async function main() {
  // every row in a bulk insert must carry the same keys: PostgREST fills a missing key with NULL, not the column default
  const now = new Date().toISOString();
  if (reset) await resetContent();
  const { data: areaRows, error: ae } = await sb.from('areas').select('id,name');
  if (ae) throw new Error(`areas: ${ae.message}`);
  const areaId = (name: string | null) => (name ? areaRows?.find((a) => a.name === name)?.id ?? null : null);

  async function existing(table: string, ids: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await sb.from(table).select('external_id').in('external_id', ids.slice(i, i + 100));
      if (error) throw new Error(`${table}: ${error.message} (did you run migration 0013?)`);
      for (const r of data ?? []) found.add(r.external_id as string);
    }
    return found;
  }
  async function insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await sb.from(table).insert(rows.slice(i, i + 50));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }

  // goals then projects; ids already exist for rows imported on a previous run, so remap to those
  const have = {
    goals: await existing('goals', plan.goals.map((g) => g.external_id)),
    projects: await existing('projects', plan.projects.map((p) => p.external_id)),
    tasks: await existing('tasks', plan.tasks.map((t) => t.external_id)),
    habits: await existing('habits', plan.habits.map((h) => h.external_id)),
  };
  const remap = async (table: string, rows: { external_id: string; id: string }[], seen: Set<string>) => {
    if (!seen.size) return;
    const { data } = await sb.from(table).select('id,external_id').in('external_id', [...seen]);
    const by = new Map((data ?? []).map((r) => [r.external_id as string, r.id as string]));
    for (const r of rows) if (by.has(r.external_id)) r.id = by.get(r.external_id)!;
  };
  await remap('goals', plan.goals, have.goals);
  await remap('projects', plan.projects, have.projects);
  const goalIdFix = new Map(plan.goals.map((g) => [g.external_id, g.id]));
  void goalIdFix;

  const newGoals = plan.goals.filter((g) => !have.goals.has(g.external_id));
  await insert('goals', newGoals.map((g) => ({
    id: g.id, external_id: g.external_id, title: g.title, area_id: areaId(g.area), status: g.status, priority: g.priority,
    start_date: g.start_date, target_date: g.target_date, notes_md: g.notes_md, created_at: g.created_at ?? now,
  })));
  const goalById = new Set(plan.goals.map((g) => g.id));
  const newProjects = plan.projects.filter((p) => !have.projects.has(p.external_id));
  await insert('projects', newProjects.map((p) => {
    if (!goalById.has(p.goal_id)) throw new Error(`project "${p.title}" points at a goal that was not imported`);
    return {
      id: p.id, external_id: p.external_id, goal_id: p.goal_id, title: p.title, area_id: areaId(p.area), status: p.status, priority: p.priority,
      start_date: p.start_date, target_date: p.target_date, notes_md: p.notes_md, created_at: p.created_at ?? now,
    };
  }));

  const newTasks = plan.tasks.filter((t) => !have.tasks.has(t.external_id));
  await insert('tasks', newTasks.map((t, i) => ({
    id: t.id, external_id: t.external_id, title: t.title, project_id: t.project_id, area_id: areaId(t.area), status: t.status,
    priority: t.priority, due_date: t.due_date, due_at: t.due_at, notes_md: t.notes_md, sort_order: i + 1, created_at: t.created_at ?? now,
  })));
  // the status trigger stamps "now" on tasks inserted as done: put back the real completion time and its event
  for (const t of newTasks.filter((x) => x.status === 'done' && x.completed_at)) {
    await sb.from('tasks').update({ completed_at: t.completed_at }).eq('id', t.id);
    await sb.from('task_events').update({ at: t.completed_at }).eq('task_id', t.id).eq('event', 'completed');
  }

  const newHabits = plan.habits.filter((h) => !have.habits.has(h.external_id));
  await insert('habits', newHabits.map((h) => ({
    external_id: h.external_id, name: h.name, time_of_day: h.time_of_day, kind: h.kind, target_value: h.target_value, unit: h.unit,
    days_of_week: h.days_of_week, area_id: areaId(h.area), created_at: h.created_at ?? now,
  })));

  console.log(`\nImported: ${newGoals.length} goals, ${newProjects.length} projects, ${newTasks.length} tasks, ${newHabits.length} habits.`);
  console.log(`Already present (left alone): ${have.goals.size} goals, ${have.projects.size} projects, ${have.tasks.size} tasks, ${have.habits.size} habits.\n`);
}
main().catch((e) => { console.error('\nImport stopped:', e instanceof Error ? e.message : e); process.exit(1); });
