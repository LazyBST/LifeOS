import 'server-only';
import { admin } from '@/lib/supabase/admin';
import type { Area, UUID } from '@/lib/types/db';

/** 'Health & Fitness' -> 'health-fitness' */
export function areaSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function listAreas(): Promise<Area[]> {
  const { data, error } = await admin().from('areas').select('*').order('sort_order');
  if (error) throw new Error(`areas: ${error.message}`);
  return data as Area[];
}

export async function getArea(id: UUID): Promise<Area | null> {
  const { data } = await admin().from('areas').select('*').eq('id', id).maybeSingle();
  return (data as Area) ?? null;
}

export async function areaBySlug(slug: string): Promise<Area | null> {
  const areas = await listAreas();
  return areas.find((a) => areaSlug(a.name) === slug) ?? null;
}

/** Loose name match used by the agent ("health", "Health & Fitness"). */
export async function areaByName(name: string | null | undefined): Promise<Area | null> {
  if (!name) return null;
  const areas = await listAreas();
  const n = name.trim().toLowerCase();
  return (
    areas.find((a) => a.name.toLowerCase() === n) ??
    areas.find((a) => areaSlug(a.name) === areaSlug(n)) ??
    areas.find((a) => a.name.toLowerCase().startsWith(n)) ??
    areas.find((a) => a.name.toLowerCase().includes(n)) ??
    null
  );
}

/** Stable colour per Area, used as dots and left borders only (spec section 6). */
export const AREA_COLORS: Record<string, string> = {
  Business: '#6366f1',
  'Health & Fitness': '#10b981',
  Relationships: '#f59e0b',
  Finances: '#06b6d4',
};

export function areaColor(area: { name: string; color?: string | null } | null | undefined): string {
  if (!area) return '#94a3b8';
  return area.color ?? AREA_COLORS[area.name] ?? '#94a3b8';
}
