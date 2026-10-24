'use server';

import { requireUser } from '@/lib/auth';
import { setUiState } from '@/lib/domain/uistate';
import { type ActionResult, run } from './_result';

const KEYS = new Set(['dashboard-layout', 'analytics-layout', 'habits-layout']);
const MAX_BYTES = 40_000;

export async function saveUiStateAction(key: string, value: unknown): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    if (!KEYS.has(key)) throw new Error('Unknown setting.');
    if (JSON.stringify(value).length > MAX_BYTES) throw new Error('Layout too large.');
    await setUiState(key, value);
    return null;
  });
}
