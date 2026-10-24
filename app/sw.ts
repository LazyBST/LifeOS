/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

/** Shape of the payload sent from the web-push server (section 8 of the spec). */
type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  actions?: { action: string; title: string }[];
};

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url ?? '/' },
      // `actions` is part of the Notifications API spec but missing from
      // TS's lib.dom NotificationOptions typing.
      ...({ actions: payload.actions } as object),
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: string };
  const url = data.url ?? '/';
  const action = event.action;

  if (action) {
    event.waitUntil(
      fetch('/api/notify/action', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: event.notification.tag }),
      }).catch(() => {
        /* best effort — the next sync will retry via the chat feed */
      }),
    );
    return;
  }

  event.waitUntil(self.clients.openWindow(url));
});
