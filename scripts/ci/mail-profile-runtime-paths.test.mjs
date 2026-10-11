import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  '.github/workflows/mail-profile-runtime-contract.yaml',
  'utf8'
);
test('profile workflow follows both lightweight resources entrypoint inputs', () => {
  const filter = workflow.slice(
    workflow.indexOf('    paths:'),
    workflow.indexOf('permissions:')
  );
  const patterns = [...filter.matchAll(/^ {6}- "([^"]+)"$/gmu)].map(
    (match) => match[1]
  );
  assert.equal(
    patterns.filter((pattern) => pattern === 'packages/sdk/src/cli/resources*')
      .length,
    1
  );
  const entry = readFileSync('packages/sdk/src/cli/resources-entry.ts', 'utf8');
  assert.match(entry, /from ['"]\.\/resources['"]/u);
  for (const input of ['resources-entry.ts', 'resources.ts']) {
    const relative = `packages/sdk/src/cli/${input}`;
    assert.ok(
      relative.startsWith(
        patterns.find((pattern) => pattern.endsWith('/resources*')).slice(0, -1)
      )
    );
  }
  assert.ok(!patterns.includes('packages/sdk/**'));
});
