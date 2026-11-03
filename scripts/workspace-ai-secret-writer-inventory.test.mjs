import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { digest, readSources } from './workspace-ai-provider-inventory.mjs';

test('all server secret writer candidates retain their reviewed name and authorization boundaries', () => {
  const sources = readSources();
  const inventory = JSON.parse(
    readFileSync(
      new URL('./workspace-ai-secret-writer-inventory.json', import.meta.url),
      'utf8'
    )
  );
  const writers = Object.keys(sources)
    .filter(
      (path) =>
        /\.from\(['"]workspace_secrets['"]\)/.test(sources[path]) &&
        /\.(?:insert|upsert|update|delete)\(/.test(sources[path])
    )
    .sort();
  assert.deepEqual(
    writers,
    inventory.map((entry) => entry.path).sort(),
    'New secret writers require reserved-name authorization review'
  );
  for (const path of writers) {
    const entry = inventory.find((entry) => entry.path === path);
    assert.ok(
      entry.authorization,
      `${path}: describe reserved-name authorization`
    );
    assert.equal(
      digest(sources[path]),
      entry.sha256,
      `${path}: writer changed; review name construction and caller authorization`
    );
    for (const { path: boundary, sha256: sha } of entry.boundaries)
      assert.equal(
        digest(sources[boundary]),
        sha,
        `${path}: changed writer boundary ${boundary}`
      );
  }
});
