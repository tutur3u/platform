import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('task UI Tailwind source boundary', () => {
  it('resolves shared task helpers from CommonJS test collection', () => {
    expect(
      require.resolve('@tuturuuu/ui/lib/task-personal-external')
    ).toContain('packages/ui/src/lib/task-personal-external.ts');
  });

  it('owns and exports its Tailwind source registration', () => {
    const packageJson = JSON.parse(
      readRepoFile('packages/tasks-ui/package.json')
    ) as { exports: Record<string, string> };

    expect(packageJson.exports['./globals.css']).toBe('./src/globals.css');
    const taskGlobals = readRepoFile('packages/tasks-ui/src/globals.css');

    expect(taskGlobals).toContain('@import "@tuturuuu/ui/globals.css";');
    expect(taskGlobals).toContain('@source "./**/*.{ts,tsx}";');
  });

  it.each([
    'apps/tasks/src/app/[locale]/layout.tsx',
    'apps/calendar/src/app/[locale]/layout.tsx',
    'apps/web/src/app/[locale]/layout.tsx',
    'apps/tanstack-web/src/styles/app.css',
  ])('%s opts into task-owned styles', (consumerEntryPoint) => {
    const consumerStyles = readRepoFile(consumerEntryPoint);

    expect(consumerStyles).toContain('@tuturuuu/tasks-ui/globals.css');
    expect(consumerStyles).not.toContain('@tuturuuu/ui/globals.css');
  });

  it('does not widen the generic UI rebuild graph', () => {
    expect(readRepoFile('packages/ui/src/globals.css')).not.toContain(
      'tasks-ui'
    );
  });
});
