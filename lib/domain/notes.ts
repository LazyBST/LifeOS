import 'server-only';
import { admin } from '@/lib/supabase/admin';
import type { UUID } from '@/lib/types/db';

export type NoteEntity = 'goal' | 'project' | 'task';
const TABLE: Record<NoteEntity, string> = { goal: 'goals', project: 'projects', task: 'tasks' };

export async function readNotes(type: NoteEntity, id: UUID, maxChars?: number): Promise<string> {
  const { data, error } = await admin().from(TABLE[type]).select('notes_md').eq('id', id).maybeSingle();
  if (error) throw new Error(`notes_read: ${error.message}`);
  const md = (data?.notes_md as string) ?? '';
  return maxChars && md.length > maxChars ? `${md.slice(0, maxChars)}\n…` : md;
}

/** Appends and never rewrites, so nothing the user wrote is lost (spec section 7). */
export async function appendNotes(type: NoteEntity, id: UUID, markdown: string): Promise<string> {
  const current = await readNotes(type, id);
  const next = current.trim().length ? `${current.replace(/\s+$/, '')}\n\n${markdown.trim()}\n` : `${markdown.trim()}\n`;
  return setNotes(type, id, next);
}

export async function setNotes(type: NoteEntity, id: UUID, markdown: string): Promise<string> {
  const { data, error } = await admin()
    .from(TABLE[type])
    .update({ notes_md: markdown, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('notes_md')
    .single();
  if (error) throw new Error(`notes_write: ${error.message}`);
  return data.notes_md as string;
}
