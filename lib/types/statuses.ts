// Status definitions. The `statuses` table (migration 0006) is the single source;
// FALLBACK_STATUSES mirrors its seed so the UI still renders before the migration is applied.

export type StatusKey = string;
export type StatusKind = 'task' | 'project' | 'goal';
export type StatusCategory = 'todo' | 'in_progress' | 'done' | 'inactive';

export type StatusDef = {
  key: StatusKey;
  label: string;
  category: StatusCategory;
  color: string;
  bg_color: string;
  fg_color: string;
  icon: string | null;
  description: string | null;
  applies_to: StatusKind[];
  sort_order: number;
  board_order: number | null;
  is_default: boolean;
  default_for: StatusKind[];
  strike_through: boolean;
  dim: boolean;
};

export const FALLBACK_STATUSES: StatusDef[] = [
  { key: 'todo', label: 'Not started', category: 'todo', color: '#64748b', bg_color: '#e2e8f0', fg_color: '#334155', icon: 'circle', description: 'Planned, not begun', applies_to: ['task'], sort_order: 10, board_order: 1, is_default: true, default_for: ['task'], strike_through: false, dim: false },
  { key: 'doing', label: 'In progress', category: 'in_progress', color: '#2563eb', bg_color: '#dbeafe', fg_color: '#1e40af', icon: 'loader-circle', description: 'Actively being worked on', applies_to: ['task'], sort_order: 20, board_order: 2, is_default: false, default_for: [], strike_through: false, dim: false },
  { key: 'done', label: 'Done', category: 'done', color: '#16a34a', bg_color: '#dcfce7', fg_color: '#166534', icon: 'circle-check', description: 'Finished', applies_to: ['task', 'project', 'goal'], sort_order: 30, board_order: 3, is_default: false, default_for: [], strike_through: true, dim: true },
  { key: 'active', label: 'Active', category: 'in_progress', color: '#2563eb', bg_color: '#dbeafe', fg_color: '#1e40af', icon: 'play', description: 'Currently pursued', applies_to: ['project', 'goal'], sort_order: 40, board_order: null, is_default: true, default_for: ['project', 'goal'], strike_through: false, dim: false },
  { key: 'paused', label: 'Paused', category: 'inactive', color: '#d97706', bg_color: '#fef3c7', fg_color: '#92400e', icon: 'pause', description: 'On hold for now', applies_to: ['project', 'goal'], sort_order: 50, board_order: null, is_default: false, default_for: [], strike_through: false, dim: true },
  { key: 'dropped', label: 'Dropped', category: 'inactive', color: '#dc2626', bg_color: '#fee2e2', fg_color: '#991b1b', icon: 'circle-x', description: 'Abandoned', applies_to: ['project', 'goal'], sort_order: 60, board_order: null, is_default: false, default_for: [], strike_through: true, dim: true },
];

export const UNKNOWN_STATUS: StatusDef = {
  key: '?', label: 'Unknown', category: 'todo', color: '#64748b', bg_color: '#e2e8f0', fg_color: '#334155', icon: 'circle',
  description: null, applies_to: [], sort_order: 999, board_order: null, is_default: false, default_for: [], strike_through: false, dim: false,
};

export function statusFor(list: StatusDef[], key: StatusKey): StatusDef {
  return list.find((s) => s.key === key) ?? { ...UNKNOWN_STATUS, key, label: key };
}

/** Statuses an entity kind may use, in dropdown order. */
export function statusesFor(list: StatusDef[], kind: StatusKind): StatusDef[] {
  return list.filter((s) => s.applies_to.includes(kind)).sort((a, b) => a.sort_order - b.sort_order);
}

/** Board columns, left to right. */
export function boardColumns(list: StatusDef[], kind: StatusKind = 'task'): StatusDef[] {
  return statusesFor(list, kind)
    .filter((s) => s.board_order != null)
    .sort((a, b) => (a.board_order ?? 0) - (b.board_order ?? 0));
}

export function defaultStatus(list: StatusDef[], kind: StatusKind): StatusDef | undefined {
  return list.find((s) => s.is_default && s.default_for.includes(kind));
}

export const isDone = (list: StatusDef[], key: StatusKey) => statusFor(list, key).category === 'done';
