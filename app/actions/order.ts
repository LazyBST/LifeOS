'use server';

import { requireUser } from '@/lib/auth';
import { setUiState } from '@/lib/domain/uistate';
import { type ActionResult, run } from './_result';

/** Remember the order of a list (goals on the dashboard, habits in a group, ...). */
export async function saveOrderAction(key: string, ids: string[]): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    if (!/^[a-z0-9:_-]{1,60}$/i.test(key)) throw new Error('Unknown list.');
    if (!Array.isArray(ids) || ids.length > 500 || ids.some((i) => typeof i !== 'string' || i.length > 80)) throw new Error('Bad order.');
    await setUiState(`order:${key}`, ids);
    return null;
  });
}
