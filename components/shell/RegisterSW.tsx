'use client';

import { useEffect } from 'react';

/** Registers the Serwist-built service worker. Production only — @serwist/next
 *  is disabled in development (see next.config.ts), so there is no /sw.js to
 *  register locally. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // best effort; the app still works without the service worker
    });
  }, []);

  return null;
}

export default RegisterSW;
