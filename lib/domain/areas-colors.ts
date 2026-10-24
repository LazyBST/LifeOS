// Client-safe Area colours (areas.ts is server-only).
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
