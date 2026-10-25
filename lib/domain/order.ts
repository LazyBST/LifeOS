import 'server-only';
import { getUiState } from './uistate';

/** The saved order of a list, or [] (natural order) when none has been saved. */
export async function getOrder(key: string): Promise<string[]> {
  const v = await getUiState<unknown>(`order:${key}`).catch(() => null);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
