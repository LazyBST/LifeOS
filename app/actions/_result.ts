export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(e: unknown): ActionResult<never> {
  const message = e instanceof Error ? e.message : String(e);
  return { ok: false, error: message === 'UNAUTHENTICATED' ? 'Please sign in again.' : message };
}

/** Wraps a server action body so callers always get an ActionResult. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e);
  }
}
