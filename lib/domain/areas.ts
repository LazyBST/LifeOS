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

export { AREA_COLORS, areaColor } from './areas-colors';
