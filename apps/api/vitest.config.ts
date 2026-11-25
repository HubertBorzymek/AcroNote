import { defineConfig } from 'vitest/config';

// bcrypt (cost 12) makes several account tests slow when the whole suite runs in parallel;
// 5 s was occasionally not enough, so give API tests more room.
export default defineConfig({
  test: { testTimeout: 20_000 },
});
