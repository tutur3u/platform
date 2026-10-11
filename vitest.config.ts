import { readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Paused runtimes must also stay excluded when invoking Vitest directly.
const apps = readdirSync(new URL('./apps', import.meta.url), {
  withFileTypes: true,
})
  .filter(
    (entry) =>
      entry.isDirectory() && !['backend', 'tanstack-web'].includes(entry.name)
  )
  .map((entry) => `apps/${entry.name}`);

export default defineConfig({
  test: {
    projects: ['packages/*', ...apps],
  },
});
