import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // vite 8 transforms JSX with oxc; tsconfig keeps jsx: preserve for Next
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...({ oxc: { jsx: { runtime: 'automatic' } } } as any),
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Tests import server-only domain modules directly; in Node this guard
      // module throws, so point it at its own no-op build.
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
});
