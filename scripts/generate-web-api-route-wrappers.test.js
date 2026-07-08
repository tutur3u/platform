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
  const legacyV1Dir = path.join(rootDir, 'legacy', 'v1');
  const appV1Dir = path.join(rootDir, 'app', 'api', 'v1');

  fs.mkdirSync(legacyV1Dir, { recursive: true });
  fs.mkdirSync(appV1Dir, { recursive: true });

  return { appV1Dir, legacyV1Dir, rootDir };
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
import * as legacyRoute from '@/legacy-api-routes/v1/users/me/profile/route';

export const GET = legacyRoute.GET;
export const HEAD = createLegacyHeadHandler(legacyRoute.GET);
export const PATCH = legacyRoute.PATCH;
`
  );
});

test('planWrapperChanges creates, updates, deletes stale generated wrappers, and blocks collisions', () => {
  const { appV1Dir, legacyV1Dir } = makeFixture();
  writeFile(
    path.join(legacyV1Dir, 'users', 'me', 'profile', 'route.ts'),
    'export async function GET() {}\nexport async function POST() {}\n'
  );

  let changes = planWrapperChanges({ appV1Dir, legacyV1Dir });
  assert.deepEqual(
    changes.map((change) => change.type),
    ['create']
  );

  applyWrapperChanges(changes, { appV1Dir });
  assert.deepEqual(planWrapperChanges({ appV1Dir, legacyV1Dir }), []);

  writeFile(
    path.join(legacyV1Dir, 'users', 'me', 'profile', 'route.ts'),
    'export async function GET() {}\n'
  );
  writeFile(path.join(appV1Dir, 'stale', 'route.ts'), `${GENERATED_MARKER}\n`);

  changes = planWrapperChanges({ appV1Dir, legacyV1Dir });
  assert.deepEqual(changes.map((change) => change.type).sort(), [
    'delete',
    'update',
  ]);

  writeFile(
    path.join(legacyV1Dir, 'auth', 'password-login', 'route.ts'),
    'export async function POST() {}\n'
  );
  writeFile(
    path.join(appV1Dir, 'auth', 'password-login', 'route.ts'),
    'export async function POST() {}\n'
  );

  changes = planWrapperChanges({ appV1Dir, legacyV1Dir });
  const collision = changes.find((change) => change.type === 'collision');
  assert.equal(
    collision.path,
    path.join(appV1Dir, 'auth', 'password-login', 'route.ts')
  );
});

test('repo import graph keeps V1 concrete and scoped catch-alls registry-light', () => {
  const v1CatchAll = path.join(
    REPO_ROOT,
    'apps',
    'web',
    'src',
    'app',
    'api',
    'v1',
    '[[...path]]',
    'route.ts'
  );
  assert.equal(fs.existsSync(v1CatchAll), false);

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

  const offenders = bridgeFiles
    .filter((filePath) =>
      fs
        .readFileSync(filePath, 'utf8')
        .includes('@/legacy-api-routes/dispatcher')
    )
    .map((filePath) => path.relative(REPO_ROOT, filePath));

  assert.deepEqual(offenders, []);
});
