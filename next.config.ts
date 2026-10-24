import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const nextConfig: NextConfig = {
  /* config options here */
};

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // RegisterSW.tsx registers the service worker itself.
  register: false,
});

export default withSerwist(nextConfig);
