import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { matchRoute } from '../../../../../packages/start-bridge/src/core/route-match.ts';

const queriesUrl = new URL('./queries.ts', import.meta.url).href;
const fixtureUrl = `data:text/javascript,${encodeURIComponent(`
  export class GitHubMirrorError extends Error {
    constructor(message, status, code) { super(message); Object.assign(this, { status, code }); }
  }
  export const requests = [];
  export const lookups = [];
  export async function githubRequest(request) { requests.push(request); return { type: 'file' }; }
  export const githubRequestWithMetadata = githubRequest;
  export async function requireRegisteredRepository(owner, name) {
    lookups.push({owner, name}); return {owner, name};
  }
  export function cacheLife() {}
  export function cacheTag() {}
`)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === queriesUrl && ['server-only', 'next/cache', './api', './registry', './errors'].includes(specifier)) {
      return { url: fixtureUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { getRepositoryContent } = await import(queriesUrl);
hooks.deregister();
const { requests, lookups } = await import(fixtureUrl);

for (const path of ['', '.', '..', 'a//b', '/a', 'a/', 'a/../b', 'a/./b', '%2F', 'a%2fb', '%5c', 'a\\b', '%00', 'a\0b', '%2e', '%2E%2E']) {
  test(`rejects unsafe content path ${JSON.stringify(path)} before repository lookup or HTTP`, async () => {
    requests.length = 0;
    lookups.length = 0;
    await assert.rejects(getRepositoryContent('owner', 'repo', path), { status: 400, code: 'invalid_content_path' });
    assert.equal(requests.length, 0);
    assert.equal(lookups.length, 0);
  });
}

test('rejects the exact encoded traversal before an installation-token request', async () => {
  const exploit = '/x/..%2F..%2F..%2F..%2F..%2Fuser';
  const matched = matchRoute('/[owner]/[repo]/[[...view]]', `/owner/repo${exploit}`);
  assert.deepEqual(matched.view, ['x', '../../../../../user']);
  const path = matched.view.join('/');
  requests.length = 0;
  await assert.rejects(getRepositoryContent('owner', 'repo', path), { status: 400, code: 'invalid_content_path' });
  assert.equal(requests.length, 0);
});

for (const [path, encoded] of [
  ['src/index.ts', 'src/index.ts'],
  ['a b/100% ready?#.md', 'a%20b/100%25%20ready%3F%23.md'],
  ['docs/é.md', 'docs/%C3%A9.md'],
]) {
  test(`preserves nested content and escapes literal file names: ${path}`, async () => {
    requests.length = 0;
    assert.deepEqual(await getRepositoryContent('owner', 'repo', path, 'feature/docs'), { type: 'file' });
    assert.deepEqual(requests, [{ path: `/contents/${encoded}`, query: { ref: 'feature/docs' }, repository: { owner: 'owner', name: 'repo' } }]);
  });
}
