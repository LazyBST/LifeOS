import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'LifeOS',
    short_name: 'LifeOS',
    description: 'Goals, projects, tasks, habits and money in one place.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1011',
    theme_color: '#0f1011',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
