'use client';
import { createContext, useContext, useMemo } from 'react';
import { FALLBACK_STATUSES, statusFor, type StatusDef, type StatusKey } from '@/lib/types/statuses';

const Ctx = createContext<StatusDef[]>(FALLBACK_STATUSES);

/** Supplies the `statuses` table rows to every client component. */
export function StatusProvider({ statuses, children }: { statuses: StatusDef[]; children: React.ReactNode }) {
  const value = useMemo(() => statuses, [statuses]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStatuses(): StatusDef[] {
  return useContext(Ctx);
}

export function useStatus(key: StatusKey): StatusDef {
  return statusFor(useContext(Ctx), key);
}
