// notes_append, notes_read (spec section 7 tool table). Appends never
// rewrite, so nothing the user wrote by hand is lost (lib/domain/notes.ts).
import { getBook } from '@/lib/domain/books';
import 'server-only';
import { z } from 'zod';
import type { ToolDef, ToolOutcome } from '../types';
import { resolveRef, toPendingChoice, askMessage } from '../resolver';
import { readNotes, appendNotes, type NoteEntity } from '@/lib/domain/notes';
import { breadcrumbFor, getTaskOrThrow } from '@/lib/domain/tasks';
import { getGoal } from '@/lib/domain/goals';
import { getProject } from '@/lib/domain/projects';

const REF_TYPES = ['goal', 'project', 'task', 'book'] as const;

type NoteResolution = { stop: ToolOutcome } | { type: NoteEntity; id: string; path?: string };

async function resolveNoteEntity(
  ref: string,
  ctx: Parameters<ToolDef['handler']>[1],
  tool: string,
  input: Record<string, unknown>,
): Promise<NoteResolution> {
  const res = await resolveRef(ref, { types: [...REF_TYPES], ctx });
  if (res.kind === 'ask') {
    return { stop: { message: askMessage('entity', res.options), pending: toPendingChoice(tool, input, 'entity_ref', res.options) } };
  }
  if (res.kind === 'none') {
    return { stop: { message: `No goal, project, task or book matching "${ref}".` } };
  }
  return { type: res.pick.type as NoteEntity, id: res.pick.id, path: res.pick.path };
}

async function pathAndTitle(type: NoteEntity, id: string): Promise<{ path: string; title: string }> {
  if (type === 'goal') {
    const g = await getGoal(id);
    return { path: g?.title ?? id, title: g?.title ?? id };
  }
  if (type === 'project') {
    const p = await getProject(id);
    const g = p?.goal_id ? await getGoal(p.goal_id) : null;
    const path = g ? `${g.title} > ${p?.title}` : p?.title ?? id;
    return { path, title: p?.title ?? id };
  }
  if (type === 'book') {
    const b = await getBook(id);
    return { path: b?.title ?? id, title: b?.title ?? id };
  }
  const t = await getTaskOrThrow(id);
  const bc = await breadcrumbFor(t);
  return { path: bc.path ? `${bc.path} > ${t.title}` : t.title, title: t.title };
}

const notesAppendSchema = z.object({ entity_ref: z.string().min(1), markdown: z.string().min(1) });

const notesAppend: ToolDef<typeof notesAppendSchema> = {
  name: 'notes_append',
  description: "Append markdown to a goal/project/task's notes. Never rewrites existing notes.",
  schema: notesAppendSchema,
  part: 1,
  handler: async (input, ctx) => {
    const resolved = await resolveNoteEntity(input.entity_ref, ctx, 'notes_append', input);
    if ('stop' in resolved) return resolved.stop;
    const before = await readNotes(resolved.type, resolved.id);
    const after = await appendNotes(resolved.type, resolved.id, input.markdown);
    const { path, title } = await pathAndTitle(resolved.type, resolved.id);
    return {
      message: `Added a note to ${path}.`,
      cards: [{ kind: resolved.type, title, subtitle: path }],
      touched: [{ type: resolved.type, id: resolved.id, title }],
      data: {
        before: { type: resolved.type, id: resolved.id, before },
        after: { type: resolved.type, id: resolved.id, after },
      },
    };
  },
};

const notesReadSchema = z.object({ entity_ref: z.string().min(1), max_chars: z.number().int().positive().optional() });

const notesRead: ToolDef<typeof notesReadSchema> = {
  name: 'notes_read',
  description: "Read a goal/project/task's notes, e.g. to summarise the steps written on a task.",
  schema: notesReadSchema,
  part: 1,
  handler: async (input, ctx) => {
    const resolved = await resolveNoteEntity(input.entity_ref, ctx, 'notes_read', input);
    if ('stop' in resolved) return resolved.stop;
    const md = await readNotes(resolved.type, resolved.id, input.max_chars);
    const { path, title } = await pathAndTitle(resolved.type, resolved.id);
    return {
      message: md.trim() ? `Notes on ${path}:\n\n${md}` : `${path} has no notes yet.`,
      touched: [{ type: resolved.type, id: resolved.id, title }],
      data: { notes_md: md },
    };
  },
};

export const notesTools: ToolDef[] = [notesAppend, notesRead];
