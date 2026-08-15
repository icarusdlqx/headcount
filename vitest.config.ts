import { defineConfig } from 'vitest/config';

// Note: Vitest loads THIS file instead of vite.config.ts. That is fine here —
// `base` and `build.target` are irrelevant to node tests — but it is worth
// knowing before wondering why a vite.config change had no effect on a test.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
