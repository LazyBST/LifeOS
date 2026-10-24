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

/** Tasks across every list. Google Tasks stores a due DATE only; its time of day is not exposed by the API. */
export async function listGoogleTasks(opts: { completedMin?: string } = {}): Promise<GTask[]> {
  const api = await client();
  const out: GTask[] = [];
  for (const list of await allLists(api)) {
    let pageToken: string | undefined;
    do {
      const res = await api.tasks.list({
        tasklist: list.id,
        showCompleted: true,
        showHidden: true,
        maxResults: 100,
        completedMin: opts.completedMin,
        pageToken,
      });
      for (const t of res.data.items ?? []) {
        if (!t.id || !t.title) continue;
        out.push({ id: t.id, listId: list.id, title: t.title, status: t.status === 'completed' ? 'completed' : 'needsAction', due: t.due ?? null, completed: t.completed ?? null });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
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
