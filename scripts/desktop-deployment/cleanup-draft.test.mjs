import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupDraft } from './cleanup-draft.mjs';

const identity = {
  version: '0.26.1',
  tag: 'desktop-v0.26.1',
  source: 'a'.repeat(40),
  run: '123',
};
const own = {
  id: 456,
  tag_name: identity.tag,
  target_commitish: identity.source,
  draft: true,
  body: `<!-- tuturuuu-desktop-release ${JSON.stringify(identity)} -->`,
};
function cleanup(release, request = identity) {
  const calls = [];
  const execute = (_command, args) => {
    calls.push(args);
    if (args[0] === 'release') return JSON.stringify({ databaseId: 456 });
    if (args.includes('DELETE')) return '';
    return JSON.stringify(release);
  };
  let error;
  try {
    cleanupDraft(request, execute);
  } catch (caught) {
    error = caught;
  }
  return { calls, error };
}

test('cleanup deletes only this run draft by verified database ID', () => {
  const { calls, error } = cleanup(own);
  assert.equal(error, undefined);
  assert.deepEqual(calls.at(-1), [
    'api',
    '--method',
    'DELETE',
    'repos/tutur3u/platform/releases/456',
  ]);
});

test('cleanup never deletes published releases, another run draft, or mismatched identities', () => {
  for (const change of [
    { draft: false },
    { id: 457 },
    { tag_name: 'desktop-v0.26.2' },
    { target_commitish: 'b'.repeat(40) },
    { body: '' },
    { body: own.body.replace('"123"', '"124"') },
  ]) {
    const { calls, error } = cleanup({ ...own, ...change });
    assert.ok(error, JSON.stringify(change));
    assert.ok(!calls.some((args) => args.includes('DELETE')));
  }
  const { calls, error } = cleanup(own, {
    ...identity,
    tag: 'desktop-v0.26.2',
  });
  assert.ok(error);
  assert.deepEqual(calls, []);
});
