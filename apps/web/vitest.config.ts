import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests live next to the source under `lib/`. We intentionally
    // exclude `app/` and `proxy.ts` for now; those touch Next.js server
    // primitives that aren't worth the test setup right now.
    include: ['lib/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts'],
    },
  },
});
