import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('task UI Tailwind source boundary', () => {
  it('owns and exports its Tailwind source registration', () => {
    const packageJson = JSON.parse(
      readRepoFile('packages/tasks-ui/package.json')
    ) as { exports: Record<string, string> };

    expect(packageJson.exports['./globals.css']).toBe('./src/globals.css');
    expect(readRepoFile('packages/tasks-ui/src/globals.css')).toContain(
      '@source "./**/*.{ts,tsx}";'
    );
  });

  it.each([
    'apps/tasks/src/app/[locale]/layout.tsx',
    'apps/calendar/src/app/[locale]/layout.tsx',
    'apps/web/src/app/[locale]/layout.tsx',
    'apps/tanstack-web/src/styles/app.css',
  ])('%s opts into task-owned styles', (consumerEntryPoint) => {
    expect(readRepoFile(consumerEntryPoint)).toContain(
      '@tuturuuu/tasks-ui/globals.css'
    );
  });

  it('does not widen the generic UI rebuild graph', () => {
    expect(readRepoFile('packages/ui/src/globals.css')).not.toContain(
      'tasks-ui'
    );
  });
});
