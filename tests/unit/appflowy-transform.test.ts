import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { buildPlan, realNotes, istDateOf, parseFrequency, habitName, pickArea, taskStatus, entityStatus, type AfDump } from '@/lib/appflowy/transform';

let n = 0;
const id = () => `id-${++n}`;
const day = (iso: string) => Math.floor(Date.parse(iso) / 1000);

const dump: AfDump = { databases: [
  { database_id: 'g', views: ['Goals'], fields: [], rows: [
    { id: 'g1', Goal: 'Build income', Area: ['Business'], Status: 'In progress', Priority: 'P1', Deadline: { start: day('2026-08-22T00:00:00Z'), end: day('2026-12-31T00:00:00Z'), has_time: false } },
    { id: 'g2', Goal: 'Park it', Area: ['Finances'], Status: 'Not Prioritised', Priority: 'P2' },
    { id: 'g3', Goal: 'New Goal', Priority: 'P1' },
    { id: 'g4', Goal: '[GOAL TEMPLATE]' },
    { id: 'g5', Goal: 'Build income', Area: ['Business'] },
  ] },
  { database_id: 'p', views: ['Projects'], fields: [], rows: [
    { id: 'p1', Project: 'Website', Goals: ['g1'], Area: ['Business'], Status: 'Todo' },
    { id: 'p2', Project: 'Orphan', Goals: [], Status: 'In progress' },
    { id: 'p3', Project: '[PROJECT TEMPLATE]', Goals: ['g1'] },
    { id: 'p4', Project: '', Goals: [] },
    { id: 'p5', Project: 'Points at a skipped goal', Goals: ['g4'] },
  ] },
  { database_id: 't', views: ['Tasks'], fields: [], rows: [
    { id: 't1', Task: 'Ship it', Project: ['p1'], Status: 'Completed', Priority: 'P0', Area: ['Business'], Deadline: { start: day('2026-10-05T00:00:00+05:30'), end: null, has_time: false }, _created_at: 1786286961, _modified_at: 1786298522 },
    { id: 't2', Task: 'Think', Project: [], Status: null, Done: false, Priority: '' },
    { id: 't3', Task: 'Doing', Project: ['p1', 'p2'], Status: 'In progress' },
    { id: 't4', Task: 'Ticked', Done: true },
    { id: 't5', Task: 'Timed', Deadline: { start: day('2026-10-25T10:00:00Z'), end: null, has_time: true } },
  ] },
  { database_id: 'h', views: ['Habits', "Today's Habits"], fields: [], rows: [
    { id: 'h1', Name: 'Gym\n18th Aug 26', Type: 'Morning', Frequency: 'Mon to saturday every week', Area: ['Health & Fitness'] },
    { id: 'h2', Name: 'Water\n18th Aug 26', Type: 'Evening', Frequency: 'Daily', Target: 3, Metric: 'Liters', Area: ['Health & Fitness'] },
    { id: 'h3', Name: 'Track Wallet', Frequency: 'Mon, Wed, Fri', Area: ['Finance'] },
  ] },
] };

describe('AppFlowy → LifeOS plan', () => {
  const plan = buildPlan(dump, id);

  it('skips templates, blanks, untouched placeholders and duplicates, and says why', () => {
    expect(plan.goals.map((g) => g.title)).toEqual(['Build income', 'Park it', 'Imported from AppFlowy (no goal)']);
    expect(plan.skipped.map((s) => `${s.kind}:${s.why}`)).toEqual(expect.arrayContaining(['goal:untouched "New Goal" placeholder', 'goal:template row', 'goal:duplicate', 'project:template row', 'project:no title']));
  });
  it('maps goal fields: status, area, priority, date range', () => {
    const g = plan.goals[0];
    expect(g).toMatchObject({ area: 'Business', status: 'active', priority: 'P1', start_date: '2026-08-22', target_date: '2026-12-31' });
    expect(plan.goals[1]).toMatchObject({ status: 'paused', area: 'Finances' });
  });
  it('every project has a goal: its own, or the catch-all', () => {
    const goalIds = new Set(plan.goals.map((g) => g.id));
    expect(plan.projects.every((p) => goalIds.has(p.goal_id))).toBe(true);
    expect(plan.projects.find((p) => p.title === 'Website')!.goal_id).toBe(plan.goals[0].id);
    expect(plan.projects.find((p) => p.title === 'Orphan')!.goal_id).toBe(plan.catchAllGoalId);
    expect(plan.projects.find((p) => p.title === 'Points at a skipped goal')!.goal_id).toBe(plan.catchAllGoalId);
  });
  it('maps task status, priority, project and dates (IST)', () => {
    const t = (title: string) => plan.tasks.find((x) => x.title === title)!;
    expect(t('Ship it')).toMatchObject({ status: 'done', priority: 'P0', area: 'Business', due_date: '2026-10-05', due_at: null });
    expect(t('Ship it').project_id).toBe(plan.projects.find((p) => p.title === 'Website')!.id);
    expect(t('Ship it').completed_at).toBe(new Date(1786298522 * 1000).toISOString());
    expect(t('Think')).toMatchObject({ status: 'todo', priority: 'P2', project_id: null });
    expect(t('Doing')).toMatchObject({ status: 'doing' });
    expect(t('Doing').project_id).toBe(plan.projects.find((p) => p.title === 'Website')!.id); // first of two projects
    expect(t('Ticked').status).toBe('done');
    expect(t('Timed').due_at).not.toBeNull();
  });
  it('maps habits: name, time of day, weekdays, count targets', () => {
    expect(plan.habits[0]).toMatchObject({ name: 'Gym', time_of_day: 'morning', days_of_week: [1, 2, 3, 4, 5, 6], kind: 'boolean' });
    expect(plan.habits[1]).toMatchObject({ name: 'Water', time_of_day: 'evening', days_of_week: null, kind: 'count', target_value: 3, unit: 'Liters' });
    expect(plan.habits[2]).toMatchObject({ days_of_week: [1, 3, 5], area: 'Finances', time_of_day: 'any' });
  });
});

describe('page bodies', () => {
  it('keeps real notes and drops empty template scaffolding', () => {
    expect(realNotes('### Quick Notes\n- \n- \n-')).toBe('');
    expect(realNotes('')).toBe('');
    expect(realNotes(undefined)).toBe('');
    expect(realNotes('## Steps\n- call the vendor\n```sh\nnpm test\n```')).toContain('call the vendor');
  });
  it('attaches notes to goals, projects and tasks by AppFlowy row id', () => {
    const plan = buildPlan(dump, id, { g1: 'goal notes', p1: 'project notes', t1: '- [ ] do the thing', t2: '### \n-' });
    expect(plan.goals[0].notes_md).toBe('goal notes');
    expect(plan.projects.find((p) => p.title === 'Website')!.notes_md).toBe('project notes');
    expect(plan.tasks.find((t) => t.title === 'Ship it')!.notes_md).toBe('- [ ] do the thing');
    expect(plan.tasks.find((t) => t.title === 'Think')!.notes_md).toBe('');
  });
});

describe('field helpers', () => {
  it('IST dates from UTC- or IST-midnight timestamps', () => {
    expect(istDateOf(day('2025-12-29T00:00:00Z'))).toBe('2025-12-29');
    expect(istDateOf(day('2026-10-04T18:30:00Z'))).toBe('2026-10-05');
    expect(istDateOf(null)).toBeNull();
  });
  it('frequencies', () => {
    expect(parseFrequency('Daily')).toBeNull();
    expect(parseFrequency('Mon to Fri')).toEqual([1, 2, 3, 4, 5]);
    expect(parseFrequency('Mon to Sat')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseFrequency('Mon, Wed, Fri')).toEqual([1, 3, 5]);
    expect(parseFrequency('Sat to Mon')).toEqual([6, 7, 1]);
    expect(parseFrequency('')).toBeNull();
  });
  it('names, areas, statuses', () => {
    expect(habitName('Vitamin D\n18th Aug 26')).toBe('Vitamin D');
    expect(pickArea(['Miscellaneous', 'Health & Fitness'])).toBe('Health & Fitness');
    expect(pickArea(['Miscellaneous'])).toBeNull();
    expect(entityStatus('Not Prioritised')).toBe('paused');
    expect(entityStatus('Todo')).toBe('active');
    expect(taskStatus('Not started', true)).toBe('done');
    expect(taskStatus('Completed', null)).toBe('done');
  });
});

describe.skipIf(!existsSync('data/appflowy/dump.json'))('your real dump (only runs where the export exists)', () => {
  it('produces a consistent plan', () => {
    const plan = buildPlan(JSON.parse(readFileSync('data/appflowy/dump.json', 'utf8')) as AfDump);
    const goalIds = new Set(plan.goals.map((g) => g.id));
    const projectIds = new Set(plan.projects.map((p) => p.id));
    expect(plan.projects.every((p) => goalIds.has(p.goal_id))).toBe(true);
    expect(plan.tasks.every((t) => !t.project_id || projectIds.has(t.project_id))).toBe(true);
    expect(new Set(plan.tasks.map((t) => t.external_id)).size).toBe(plan.tasks.length);
    expect(plan.tasks.every((t) => t.title.length > 0)).toBe(true);
  });
});
