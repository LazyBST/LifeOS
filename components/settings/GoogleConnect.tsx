'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export type GoogleConnectProps = {
  connected: boolean;
  connectedEmail?: string | null;
  lastSyncError?: string | null;
};

/**
 * `/api/google/connect` and `/api/google/callback` are owned by another
 * worker and may not exist yet. Degrade with a toast instead of crashing.
 */
export function GoogleConnect({ connected, connectedEmail, lastSyncError }: GoogleConnectProps) {
  const [pending, startTransition] = useTransition();
  const [localConnected, setLocalConnected] = useState(connected);

  const disconnect = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/google/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disconnect: true }),
        });
        if (!res.ok) {
          if (res.status === 404) {
            toast.error('Google Calendar connect is not deployed yet.');
            return;
          }
          const body = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        setLocalConnected(false);
        toast.success('Disconnected Google Calendar.');
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        toast.error(`Could not disconnect: ${message}`);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
        <span>
          Status:{' '}
          <span className="font-medium">
            {localConnected ? `Connected${connectedEmail ? ` (${connectedEmail})` : ''}` : 'Not connected'}
          </span>
        </span>
        {localConnected ? (
          <Button variant="outline" size="sm" onClick={disconnect} disabled={pending}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" render={<a href="/api/google/connect" />}>
            Connect Google Calendar
          </Button>
        )}
      </div>
      {lastSyncError ? (
        <p className="text-xs text-destructive">Last sync error: {lastSyncError}</p>
      ) : null}
    </div>
  );
}

export default GoogleConnect;
