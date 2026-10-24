// Entity reference resolver (spec section 7, "Resolving ambiguous references").
//
// Deviation from the spec: Postgres has `pg_trgm` enabled (spec section 4,
// `create extension if not exists pg_trgm;` plus gin_trgm_ops indexes on
// goals/projects/tasks titles) and its `similarity()` function is the
// natural way to rank fuzzy matches. But calling a SQL function from
// postgrest needs either `.rpc('name', ...)` against a function the
// migrations expose, or ordering by a raw SQL expression — neither of which
// the existing migrations (0001..0005) define, and this worker owns none of
// them. So instead we prefilter candidates with a plain `ilike`-free scoped
// query (the tables are personal-scale, not web-scale) and score them in JS
// with a trigram/Dice approximation of `similarity()`. Good enough for
// auto-pick/ask thresholds tuned in lib/agent/rank.ts; noted here and in the
// final report as the one deliberate deviation from the letter of the spec.
import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { rank, resolveRanked, type Candidate, type Resolution, type Scored } from './rank';
import type { ToolContext } from './types';
import type { PendingChoice } from '@/lib/types/db';

export type RefType = 'goal' | 'project' | 'task' | 'habit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRONOUNS = new Set(['this', 'it', 'here', 'that', 'current']);

const TABLE: Record<RefType, string> = { goal: 'goals', project: 'projects', task: 'tasks', habit: 'habits' };
const TITLE_KEY: Record<RefType, string> = { goal: 'title', project: 'title', task: 'title', habit: 'name' };

function isPronoun(ref: string): boolean {
  return PRONOUNS.has(ref.trim().toLowerCase());
}

/** Pads like pg_trgm does (two leading blanks, one trailing) so short-title
 * matches ("Gym" vs "the gym") score reasonably. */
function trigrams(s: string): Set<string> {
  const t = `  ${s.trim().toLowerCase()} `;
  const out = new Set<string>();
  for (let i = 0; i <= t.length - 3; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Dice/Jaccard-style overlap of trigram sets — an in-process stand-in for
 * Postgres `similarity()` (see the module-level deviation note). */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let common = 0;
  for (const g of A) if (B.has(g)) common++;
  return common / (A.size + B.size - common);
}

type Scope = { goal_id?: string; project_id?: string };

async function fetchCandidatesForType(type: RefType, query: string, scope?: Scope): Promise<Candidate[]> {
  const table = TABLE[type];
  const titleKey = TITLE_KEY[type];
  let q = admin().from(table).select('*');
  q = type === 'habit' ? q.is('archived_at', null) : q.is('deleted_at', null);
  if (type === 'project' && scope?.goal_id) q = q.eq('goal_id', scope.goal_id);
  if (type === 'task') {
    if (scope?.project_id) q = q.eq('project_id', scope.project_id);
    else if (scope?.goal_id) q = q.eq('goal_id', scope.goal_id);
  }
  const { data, error } = await q.limit(300);
  if (error) throw new Error(`resolver ${type}: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    type,
    title: r[titleKey] as string,
    similarity: trigramSimilarity(query, r[titleKey] as string),
    status: r.status as string | undefined,
    updated_at: r.updated_at as string | undefined,
    due_date: (r.due_date as string | null | undefined) ?? null,
  }));
}

/** Entity + breadcrumb-ish path, used only to echo "chosen X (path)" so a
 * wrong auto-pick is visible (spec section 7). */
async function pathFor(type: RefType, id: string): Promise<string | undefined> {
  if (type === 'goal') {
    const { data } = await admin().from('goals').select('title').eq('id', id).maybeSingle();
    return (data?.title as string) ?? undefined;
  }
  if (type === 'project') {
    const { data } = await admin().from('projects').select('title,goal_id').eq('id', id).maybeSingle();
    if (!data) return undefined;
    const { data: g } = await admin().from('goals').select('title').eq('id', data.goal_id as string).maybeSingle();
    return g ? `${g.title} > ${data.title}` : (data.title as string);
  }
  if (type === 'task') {
    const { data } = await admin().from('tasks').select('title,project_id,goal_id').eq('id', id).maybeSingle();
    if (!data) return undefined;
    const parts: string[] = [];
    if (data.goal_id) {
      const { data: g } = await admin().from('goals').select('title').eq('id', data.goal_id as string).maybeSingle();
      if (g) parts.push(g.title as string);
    }
    if (data.project_id) {
      const { data: p } = await admin().from('projects').select('title').eq('id', data.project_id as string).maybeSingle();
      if (p) parts.push(p.title as string);
    }
    parts.push(data.title as string);
    return parts.join(' > ');
  }
  return undefined;
}

async function enrich(options: Scored[]): Promise<Scored[]> {
  return Promise.all(
    options.map(async (o) => ({ ...o, path: (await pathFor(o.type, o.id)) ?? o.path })),
  );
}

async function enrichResolution(res: Resolution): Promise<Resolution> {
  if (res.kind === 'none') return res;
  const options = await enrich(res.options);
  if (res.kind === 'auto') {
    const pick = options.find((o) => o.id === res.pick.id) ?? { ...res.pick };
    return { kind: 'auto', pick, options };
  }
  return { kind: 'ask', options };
}

async function pageEntityTitle(ctx: ToolContext, type: RefType): Promise<string | null> {
  const page = ctx.page;
  if (!page.entity_id || page.entity_type !== type) return null;
  const table = TABLE[type];
  const titleKey = TITLE_KEY[type];
  const { data } = await admin().from(table).select(titleKey).eq('id', page.entity_id).maybeSingle();
  return (data as Record<string, unknown> | null)?.[titleKey] as string | null ?? null;
}

/**
 * Turn a natural-language `ref` into a resolved id, following spec section 7:
 * 1. an explicit uuid wins outright;
 * 2. the page entity and recently-touched entities are tried next (and are
 *    the *only* thing a bare "this"/"it"/"here" can mean);
 * 3. otherwise a scope-limited trigram search feeds `resolveRanked`, which
 *    applies the auto-pick thresholds from lib/agent/rank.ts.
 */
export async function resolveRef(
  ref: string,
  opts: { types: RefType[]; ctx: ToolContext; scope?: Scope },
): Promise<Resolution> {
  const { types, ctx, scope } = opts;
  const trimmed = ref.trim();
  if (!trimmed) return { kind: 'none' };

  if (UUID_RE.test(trimmed)) {
    for (const t of types) {
      const table = TABLE[t];
      const titleKey = TITLE_KEY[t];
      const { data } = await admin().from(table).select('*').eq('id', trimmed).maybeSingle();
      if (!data) continue;
      const row = data as Record<string, unknown>;
      if (row.deleted_at || row.archived_at) continue;
      const cand: Scored = {
        id: row.id as string,
        type: t,
        title: row[titleKey] as string,
        similarity: 1,
        status: row.status as string | undefined,
        updated_at: row.updated_at as string | undefined,
        due_date: (row.due_date as string | null | undefined) ?? null,
        inContext: true,
        score: 1,
      };
      return enrichResolution({ kind: 'auto', pick: cand, options: [cand] });
    }
    return { kind: 'none' };
  }

  const candidates: Candidate[] = [];
  const byId = new Map<string, Candidate>();
  const add = (c: Candidate) => {
    const existing = byId.get(c.id);
    if (existing) {
      existing.inContext = existing.inContext || c.inContext;
      existing.similarity = Math.max(existing.similarity, c.similarity);
      return;
    }
    byId.set(c.id, c);
    candidates.push(c);
  };

  const pronoun = isPronoun(trimmed);
  const pageType = ctx.page.entity_type as RefType;
  if (ctx.page.entity_id && types.includes(pageType)) {
    const title = await pageEntityTitle(ctx, pageType);
    if (title) {
      add({
        id: ctx.page.entity_id,
        type: pageType,
        title,
        similarity: pronoun ? 1 : trigramSimilarity(trimmed, title),
        inContext: true,
      });
    }
  }
  for (const r of ctx.recent) {
    if (types.includes(r.type as RefType)) {
      add({
        id: r.id,
        type: r.type as RefType,
        title: r.title,
        similarity: pronoun ? 0.95 : trigramSimilarity(trimmed, r.title),
        inContext: true,
      });
    }
  }

  if (pronoun) {
    if (candidates.length === 0) return { kind: 'none' };
    return enrichResolution(resolveRanked(candidates, ctx.now));
  }

  for (const t of types) {
    const found = await fetchCandidatesForType(t, trimmed, scope);
    for (const c of found) if (c.similarity > 0.05) add(c);
  }

  if (candidates.length === 0) return { kind: 'none' };
  return enrichResolution(resolveRanked(candidates, ctx.now));
}

/** Free-text search across types, used by the `search` tool — same scoring,
 * no auto-pick/ask split since the caller just wants a ranked list. */
export async function searchEntities(
  query: string,
  types: RefType[] = ['goal', 'project', 'task', 'habit'],
  opts: { includeDone?: boolean; limit?: number } = {},
): Promise<Scored[]> {
  const all: Candidate[] = [];
  for (const t of types) all.push(...(await fetchCandidatesForType(t, query)));
  const filtered = opts.includeDone ? all : all.filter((c) => c.status !== 'done' && c.status !== 'dropped');
  const top = rank(filtered).slice(0, opts.limit ?? 10);
  return enrich(top) as Promise<Scored[]>;
}

/** Builds the PendingChoice the tool returns when resolveRef says 'ask'. */
export function toPendingChoice(tool: string, input: Record<string, unknown>, field: string, options: Scored[]): PendingChoice {
  return {
    tool,
    input,
    field,
    options: options.slice(0, 5).map((o) => ({ id: o.id, label: o.title, path: o.path })),
  };
}

/** Short numbered list the model/UI shows while a pending choice is open. */
export function askMessage(label: string, options: Scored[]): string {
  const lines = options
    .slice(0, 5)
    .map((o, i) => `${i + 1}. ${o.title}${o.path ? ` (${o.path})` : ''}`);
  return `Which ${label} did you mean?\n${lines.join('\n')}`;
}
