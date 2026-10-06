import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
test('exact CI full-schema contract executes the memory audit fixture', () => {
  const verifier = read('./verify-programming-database-contract.mjs');
  assert.match(
    verifier,
    /const fixtures = \[[\s\S]*?'ai-memory-edit-audit\.sql'/
  );
  assert.match(verifier, /for \(const fixture of fixtures\)/);
  assert.match(verifier, /assertStrictTap\(tap\)/);
  const workflow = read(
    '../../../.github/workflows/programming-database-contract.yaml'
  );
  assert.match(
    workflow,
    /apps\/database\/supabase\/tests\/ai-memory-edit-audit\.sql/
  );
  assert.match(
    workflow,
    /node apps\/database\/scripts\/verify-programming-database-contract\.mjs/
  );
});
