import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const retired = [
  'workspaces/[wsId]/users/route.ts',
  'workspaces/[wsId]/users/[userId]/route.ts',
];

for (const route of retired) {
  test(`retired collection/item route stays absent: ${route}`, () => {
    for (const prefix of [
      'apps/web/src/app/api/',
      'apps/web/src/legacy-api-routes/',
    ]) {
      assert.equal(
        existsSync(new URL(prefix + route, root)),
        false,
        prefix + route
      );
    }
    assert.equal(
      existsSync(new URL('apps/web/src/app/api/v1/' + route, root)),
      true
    );
  });
}

test('active retained inventory omits retired collection/item routes', () => {
  const routes = JSON.parse(read('apps/api/generated/retained-routes.json'));
  for (const path of [
    '/api/workspaces/{wsId}/users',
    '/api/workspaces/{wsId}/users/{userId}',
  ]) {
    assert.equal(
      routes.some((route) => route.path === path),
      false,
      path
    );
  }
});

test('published route index omits retired collection/item routes', () => {
  const index = read('apps/docs/reference/repository/routes/web-5.mdx');
  for (const path of [
    '/api/workspaces/[wsId]/users',
    '/api/workspaces/[wsId]/users/[userId]',
  ]) {
    assert.equal(index.includes('`' + path + '` |'), false, path);
  }
});
