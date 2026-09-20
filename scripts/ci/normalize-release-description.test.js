const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  normalizeReleaseDescription,
  normalizeReleasePullRequest,
} = require('./normalize-release-description');

const ref = (hash) =>
  `([${hash}](https://github.com/tutur3u/platform/commit/${hash}))`;
const section = (name) =>
  `<details><summary>${name}: 1.0.0</summary>\n\n## [1.0.0](https://example.test)\n### Fixes\n* Fix ${ref('aaa')}\n* Fix ${ref('bbb')}\n</details>`;
const footer =
  '\nThis PR was generated with [Release Please](https://example.test).\n<!-- review bot -->\n* Fix unrelated summary\n';
const body = `${section('platform')}\n${section('calendar')}${footer}`;
const pull = {
  number: 42,
  body,
  state: 'open',
  head: { sha: 'head', ref: 'release-please--branches--production' },
  base: { ref: 'production' },
};

test('deduplicates within components, preserves references and bot content, and is idempotent', () => {
  const result = normalizeReleaseDescription(body);
  assert.equal(result.match(/^\* Fix /gm).length, 3);
  assert.equal(result.match(/aaa/g).length, 4);
  assert.equal(result.match(/bbb/g).length, 4);
  assert.ok(result.endsWith(footer));
  assert.equal(normalizeReleaseDescription(result), result);
});

test('leaves ordinary PRs and non-release details unchanged', () => {
  assert.equal(
    normalizeReleaseDescription(section('platform')),
    section('platform')
  );
  const input = `<details><summary>Review</summary>\n* Fix ${ref('aaa')}\n* Fix ${ref('bbb')}\n</details>${footer}`;
  assert.equal(normalizeReleaseDescription(input), input);
});

test('updates only the description after rechecking the generated PR', async () => {
  const calls = [];
  const client = {
    findReleasePullRequest: async () => pull,
    request: async (...args) => {
      calls.push(args);
      return pull;
    },
  };
  assert.deepEqual(await normalizeReleasePullRequest(client), {
    changed: true,
    number: 42,
  });
  assert.deepEqual(calls[1], [
    'PATCH',
    '/pulls/42',
    { body: { body: normalizeReleaseDescription(body) } },
  ]);
});

for (const changed of [
  { body: 'human edit' },
  { head: { ...pull.head, sha: 'new' } },
  { state: 'closed' },
  { base: { ref: 'main' } },
]) {
  test(`rejects concurrent PR changes: ${Object.keys(changed)[0]}`, async () => {
    const client = {
      findReleasePullRequest: async () => pull,
      request: async (method) => {
        assert.equal(method, 'GET');
        return { ...pull, ...changed };
      },
    };
    await assert.rejects(
      normalizeReleasePullRequest(client),
      /changed during normalization/
    );
  });
}

test('does not write when no generated PR or no duplicates exist', async () => {
  for (const candidate of [
    undefined,
    { ...pull, body: normalizeReleaseDescription(body) },
  ]) {
    const client = {
      findReleasePullRequest: async () => candidate,
      request: async () => assert.fail('unexpected write'),
    };
    assert.equal((await normalizeReleasePullRequest(client)).changed, false);
  }
});
