'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  listPushDevicesAction,
  removePushDeviceAction,
  sendTestNotificationAction,
} from '@/app/actions/settings';
import type { PushSubscriptionRow } from '@/lib/types/db';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint.slice(0, 40);
  }
}

export function PushSetup() {
  const [permission, setPermission] = useState<PermissionState>('default');
  const [devices, setDevices] = useState<PushSubscriptionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const refreshDevices = useCallback(() => {
    startTransition(async () => {
      const res = await listPushDevicesAction();
      if (res.ok) setDevices(res.data);
      else toast.error(`Could not load devices: ${res.error}`);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
    } else {
      setPermission(Notification.permission as PermissionState);
    }
    refreshDevices();
  }, [refreshDevices]);

  const subscribe = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      toast.error('Push is not supported in this browser (no service worker — this also happens in local dev).');
      return;
    }
    setBusy(true);
    try {
      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
      }
      setPermission(perm as PermissionState);
      if (perm !== 'granted') {
        toast.error('Notification permission was not granted.');
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        toast.error('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY — push is not configured for this deployment.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      const json = subscription.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          user_agent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast.success('This device is now registered for push notifications.');
      refreshDevices();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`Could not subscribe to push: ${message}`);
    } finally {
      setBusy(false);
    }
  }, [refreshDevices]);

  const unsubscribeThisDevice = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      toast.error('No service worker registered in this browser.');
      return;
    }
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        toast.message('This device was not subscribed.');
        return;
      }
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      const res = await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast.success('Unsubscribed this device.');
      refreshDevices();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`Could not unsubscribe: ${message}`);
    } finally {
      setBusy(false);
    }
  }, [refreshDevices]);

  const removeDevice = useCallback(
    (id: string) => {
      startTransition(async () => {
        const res = await removePushDeviceAction(id);
        if (res.ok) {
          toast.success('Device removed.');
          refreshDevices();
        } else {
          toast.error(`Could not remove device: ${res.error}`);
        }
      });
    },
    [refreshDevices],
  );

  const sendTest = useCallback(() => {
    startTransition(async () => {
      const res = await sendTestNotificationAction();
      if (res.ok) toast.success(`Test sent: ${res.data}`);
      else toast.error(`Could not send test: ${res.error}`);
    });
  }, []);

  const permissionLabel: Record<PermissionState, string> = {
    default: 'Not asked yet',
    granted: 'Granted',
    denied: 'Denied — re-enable notifications for this site in the browser settings',
    unsupported: 'Not supported in this browser',
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        On Android, install the PWA first (browser menu &rarr; Add to Home screen), open it from the home
        screen, then enable notifications below. Test with the app fully closed — that is the only way to
        know a push will actually wake the phone.
      </p>

      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <span>
          Permission: <span className="font-medium">{permissionLabel[permission]}</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={subscribe} disabled={busy}>
          Enable push on this device
        </Button>
        <Button variant="outline" onClick={unsubscribeThisDevice} disabled={busy}>
          Unsubscribe this device
        </Button>
        <Button variant="outline" onClick={sendTest} disabled={busy}>
          Send test notification
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="text-xs font-medium text-muted-foreground">Registered devices</h4>
        {devices.length === 0 ? (
          <p className="text-xs text-muted-foreground">No devices registered yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate font-medium">{hostOf(d.endpoint)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {d.user_agent ?? 'unknown device'} · added {new Date(d.created_at).toLocaleDateString()}
                  </span>
                  {d.last_error ? (
                    <span className="truncate text-xs text-destructive">{d.last_error}</span>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeDevice(d.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default PushSetup;
