import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('SR-259 parameterized workspace summaries remain server-only, outside the action graph', () => {
  const source = readFileSync(
    new URL('../packages/ui/src/lib/workspace-actions.ts', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /^['"]use server['"]/);
  assert.match(source, /import ['"]server-only['"]/);
  const action = readFileSync(
    new URL(
      '../apps/web/src/app/[locale]/(dashboard)/[wsId]/workspace-list-actions.ts',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(action, /^['"]use server['"]/);
  assert.match(action, /export async function fetchWorkspaces\(\)/);
});
