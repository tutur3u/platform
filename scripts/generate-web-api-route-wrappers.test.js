const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  GENERATED_MARKER,
  applyWrapperChanges,
  extractRouteMethods,
  planWrapperChanges,
  wrapperContent,
} = require('./generate-web-api-route-wrappers.js');

const REPO_ROOT = path.resolve(__dirname, '..');

function makeFixture() {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'web-api-route-wrappers-')
  );
  const legacyApiDir = path.join(rootDir, 'legacy-api-routes');
  const appApiDir = path.join(rootDir, 'app', 'api');

  fs.mkdirSync(legacyApiDir, { recursive: true });
  fs.mkdirSync(appApiDir, { recursive: true });

  return { appApiDir, legacyApiDir, rootDir };
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('extractRouteMethods finds route method export shapes', () => {
  assert.deepEqual(
    extractRouteMethods(`
      export async function GET() {}
      export const POST = GET;
      export { handler as PUT, PATCH };
      export const { DELETE, OPTIONS, HEAD } = createRoute();
    `),
    ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  );
});

test('wrapperContent imports one legacy route and adds GET-backed HEAD fallback', () => {
  assert.equal(
    wrapperContent('users/me/profile/route.ts', ['GET', 'PATCH']),
    `${GENERATED_MARKER}

import { createLegacyHeadHandler } from '@/legacy-api-routes/head';
import * as legacyRoute from '@/legacy-api-routes/users/me/profile/route';

export const GET = legacyRoute.GET;
export const HEAD = createLegacyHeadHandler(legacyRoute.GET);
export const PATCH = legacyRoute.PATCH;
`
  );
});

test('planWrapperChanges creates, updates, deletes stale generated wrappers, and blocks collisions', () => {
  const { appApiDir, legacyApiDir } = makeFixture();
  writeFile(
    path.join(legacyApiDir, 'users', 'me', 'profile', 'route.ts'),
    'export async function GET() {}\nexport async function POST() {}\n'
  );

  let changes = planWrapperChanges({ appApiDir, legacyApiDir });
  assert.deepEqual(
    changes.map((change) => change.type),
    ['create']
  );

  applyWrapperChanges(changes, { appApiDir });
  assert.deepEqual(planWrapperChanges({ appApiDir, legacyApiDir }), []);

  writeFile(
    path.join(legacyApiDir, 'users', 'me', 'profile', 'route.ts'),
    'export async function GET() {}\n'
  );
  writeFile(path.join(appApiDir, 'stale', 'route.ts'), `${GENERATED_MARKER}\n`);

  changes = planWrapperChanges({ appApiDir, legacyApiDir });
  assert.deepEqual(changes.map((change) => change.type).sort(), [
    'delete',
    'update',
  ]);

  writeFile(
    path.join(legacyApiDir, 'auth', 'password-login', 'route.ts'),
    'export async function POST() {}\n'
  );
  writeFile(
    path.join(appApiDir, 'auth', 'password-login', 'route.ts'),
    'export async function POST() {}\n'
  );

  changes = planWrapperChanges({ appApiDir, legacyApiDir });
  const collision = changes.find((change) => change.type === 'collision');
  assert.equal(
    collision.path,
    path.join(appApiDir, 'auth', 'password-login', 'route.ts')
  );
});

test('planWrapperChanges skips empty legacy route files with no HTTP methods', () => {
  const { appApiDir, legacyApiDir } = makeFixture();
  const emptyWrapperPath = path.join(appApiDir, 'empty', 'route.ts');

  writeFile(path.join(legacyApiDir, 'empty', 'route.ts'), '');
  writeFile(emptyWrapperPath, `${GENERATED_MARKER}\n`);

  assert.deepEqual(planWrapperChanges({ appApiDir, legacyApiDir }), [
    { path: emptyWrapperPath, type: 'delete' },
  ]);
});

test('repo import graph keeps legacy API routes concrete without catch-all bridges', () => {
  const apiDir = path.join(REPO_ROOT, 'apps', 'web', 'src', 'app', 'api');
  const bridgeFiles = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (
        entry.name === 'route.ts' &&
        entryPath.includes(`${path.sep}[[...path]]${path.sep}`)
      ) {
        bridgeFiles.push(entryPath);
      }
    }
  }

  walk(apiDir);

  assert.deepEqual(
    bridgeFiles.map((filePath) => path.relative(REPO_ROOT, filePath)),
    []
  );
});
