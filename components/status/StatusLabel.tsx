'use client';
import { StatusBadge } from './StatusBadge';
import { useStatus } from './StatusProvider';

/** StatusBadge looked up by key from the provider. */
export function StatusLabel({ status, compact }: { status: string; compact?: boolean }) {
  return <StatusBadge status={useStatus(status)} compact={compact} />;
}
