import { defineConfig } from 'vitest/config';

// Root project discovery must not load the Cloudflare development plugin.
// Protocol and Worker/SQLite tests run through the explicit Node test scripts
// in Meet validation; these are not Vitest suites.
export default defineConfig({
  test: { include: [] },
});
