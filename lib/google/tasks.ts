import 'server-only';
import { google, tasks_v1 } from 'googleapis';
import { authedClient } from './auth';

async function client(): Promise<tasks_v1.Tasks> {
  return google.tasks({ version: 'v1', auth: await authedClient() });
}

export type GTask = { id: string; listId: string; title: string; status: 'needsAction' | 'completed'; due: string | null; completed: string | null };

async function allLists(api: tasks_v1.Tasks): Promise<{ id: string; title: string }[]> {
  const res = await api.tasklists.list({ maxResults: 100 });
  return (res.data.items ?? []).filter((l) => l.id).map((l) => ({ id: l.id!, title: l.title ?? '' }));
}

export type ListOpts = {
  /** only tasks completed after this instant */
  completedMin?: string;
  /** only tasks changed after this instant: completing a task changes it, so this finds recent completions cheaply */
  updatedMin?: string;
  /** only tasks due in this window (RFC 3339) */
  dueMin?: string;
  dueMax?: string;
  showCompleted?: boolean;
  /** stop after this many pages of 100 per list (default 3) */
  maxPages?: number;
};

/**
 * Tasks across every list, narrowed by the options so a large Google Tasks history is never walked in full.
 * Google Tasks stores a due DATE only; its time of day is not exposed by the API.
 */
export async function listGoogleTasks(opts: ListOpts = {}): Promise<GTask[]> {
  const api = await client();
  const out: GTask[] = [];
  const maxPages = opts.maxPages ?? 3;
  for (const list of await allLists(api)) {
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const res = await api.tasks.list({
        tasklist: list.id,
        showCompleted: opts.showCompleted ?? true,
        showHidden: opts.showCompleted ?? true,
        maxResults: 100,
        completedMin: opts.completedMin,
        updatedMin: opts.updatedMin,
        dueMin: opts.dueMin,
        dueMax: opts.dueMax,
        pageToken,
      });
      for (const t of res.data.items ?? []) {
        if (!t.id || !t.title) continue;
        out.push({ id: t.id, listId: list.id, title: t.title, status: t.status === 'completed' ? 'completed' : 'needsAction', due: t.due ?? null, completed: t.completed ?? null });
      }
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }
  }
  return out;
}

export async function completeGoogleTask(listId: string, taskId: string): Promise<void> {
  const api = await client();
  await api.tasks.patch({ tasklist: listId, task: taskId, requestBody: { status: 'completed' } });
}

export async function reopenGoogleTask(listId: string, taskId: string): Promise<void> {
  const api = await client();
  await api.tasks.patch({ tasklist: listId, task: taskId, requestBody: { status: 'needsAction', completed: null } });
}
