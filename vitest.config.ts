import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    environment: 'node',
    // Fresh SQLite test DB is created once, before any suite runs.
    globalSetup: ['./tests/helpers/global-setup.ts'],
    // Per-file DB lifecycle (truncate between tests, disconnect at the end).
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['node_modules/**', 'tests/e2e/**', '.next/**'],
    // One SQLite file cannot take concurrent writers from many processes.
    // A single fork keeps the harness deterministic.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 20_000,
    hookTimeout: 60_000,
    environmentMatchGlobs: [['tests/**/*.test.tsx', 'jsdom']],
  },
});
