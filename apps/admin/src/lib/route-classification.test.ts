import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { appApiPatterns } from '../start-bridge/api-patterns.bridge.gen';
import {
  classifyInfrastructureRoute,
  ROUTE_EXCEPTIONS,
} from './route-classification';
import { inventoryInfrastructureRoutes } from './route-inventory';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const inventory = inventoryInfrastructureRoutes(appRoot);

test('actual API handlers match the canonical emitted registry', () => {
  assert.deepEqual(
    inventory
      .filter((r) => r.file.endsWith('/route.ts'))
      .map((r) => r.path)
      .sort(),
    [...appApiPatterns].sort()
  );
  assert(inventory.length > 300);
});

test('every exception resolves to an actual exported handler or page', () => {
  for (const entry of ROUTE_EXCEPTIONS) {
    assert(
      inventory.some(
        (route) =>
          route.path === entry.path &&
          route.methods.some((m) => m.method === entry.method)
      ),
      JSON.stringify(entry)
    );
  }
});

test('inventory records every route and method classification for security review', () => {
  const expected = readFileSync(
    new URL('./route-inventory.jsonl', import.meta.url),
    'utf8'
  );
  assert.equal(
    inventory.map((route) => JSON.stringify(route)).join('\n') + '\n',
    expected
  );
});

test('exceptions cannot expand through prefixes, methods, encoding or normalization', () => {
  for (const entry of ROUTE_EXCEPTIONS) {
    for (const path of [
      entry.path + '/child',
      entry.path + '/',
      entry.path + '?x=1',
      entry.path.toUpperCase(),
      '/unknown' + entry.path,
      entry.path.replace('/', '/%2f'),
    ]) {
      assert.equal(
        classifyInfrastructureRoute(path, entry.method),
        'ADMIN',
        path
      );
    }
    assert.equal(classifyInfrastructureRoute(entry.path, 'DELETE'), 'ADMIN');
  }
  for (const path of [
    '/api/health',
    '/api/build-info',
    '/',
    '/api/auth/logout',
    '/api/auth/verify-app-token',
    '/api/auth/refresh-app-session',
    '/api/cron/new-job',
  ]) {
    assert.equal(classifyInfrastructureRoute(path, 'GET'), 'ADMIN');
  }
});
