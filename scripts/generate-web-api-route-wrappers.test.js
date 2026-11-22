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
const { guardedWorkspaceGroups } = require('./web-api-wrapper-groups.js');

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

import {
  createLegacyGetHandler,
  createLegacyHeadHandler,
} from '@/legacy-api-routes/head';
import * as legacyRoute from '@/legacy-api-routes/users/me/profile/route';

export const GET = createLegacyGetHandler(legacyRoute.GET);
export const HEAD = createLegacyHeadHandler(GET);
export const PATCH = legacyRoute.PATCH;
`
  );
});

test('wrapperContent still streams explicit GET routes that provide HEAD', () => {
  assert.equal(
    wrapperContent('health/route.ts', ['GET', 'HEAD']),
    `${GENERATED_MARKER}

import { createLegacyGetHandler } from '@/legacy-api-routes/head';
import * as legacyRoute from '@/legacy-api-routes/health/route';

export const GET = createLegacyGetHandler(legacyRoute.GET);
export const HEAD = legacyRoute.HEAD;
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

test('planWrapperChanges passes a workspace group guard to its router', () => {
  const { appApiDir, legacyApiDir } = makeFixture();
  const groupDir = path.join(legacyApiDir, 'v1', 'workspaces', '[wsId]');
  writeFile(
    path.join(groupDir, 'roles', 'route.ts'),
    'export async function GET() {}\n'
  );
  writeFile(
    path.join(groupDir, 'external-apps', 'members', 'route.ts'),
    'export async function GET() {}\n'
  );
  writeFile(
    path.join(groupDir, 'external-apps', 'route-guard.ts'),
    'export const guard = () => undefined;\n'
  );

  const contents = Object.fromEntries(
    planWrapperChanges({ appApiDir, legacyApiDir }).map((change) => [
      path.relative(appApiDir, change.path).split(path.sep).join('/'),
      change.content,
    ])
  );

  const guarded =
    contents['v1/workspaces/[wsId]/external-apps/[...segments]/route.ts'];
  assert.match(
    guarded,
    /import \{ guard \} from '@\/legacy-api-routes\/v1\/workspaces\/\[wsId\]\/external-apps\/route-guard';/u
  );
  assert.match(guarded, /\],\s*guard\s*\);/u);
  assert.doesNotMatch(
    contents['v1/workspaces/[wsId]/roles/[[...segments]]/route.ts'],
    /guard/u
  );
});

test('planWrapperChanges refuses a missing or unlisted group guard', () => {
  const { appApiDir, legacyApiDir } = makeFixture();
  const groupDir = path.join(legacyApiDir, 'v1', 'workspaces', '[wsId]');
  writeFile(
    path.join(groupDir, 'external-apps', 'members', 'route.ts'),
    'export async function GET() {}\n'
  );
  assert.throws(
    () => planWrapperChanges({ appApiDir, legacyApiDir }),
    /Missing route-guard\.ts for guarded group/u
  );

  writeFile(
    path.join(groupDir, 'external-apps', 'route-guard.ts'),
    'export const guard = () => undefined;\n'
  );
  writeFile(
    path.join(groupDir, 'roles', 'route.ts'),
    'export async function GET() {}\n'
  );
  writeFile(
    path.join(groupDir, 'roles', 'route-guard.ts'),
    'export const guard = () => undefined;\n'
  );
  assert.throws(
    () => planWrapperChanges({ appApiDir, legacyApiDir }),
    /roles is not a guarded group/u
  );
});

test('repo wrappers pass every guarded group its route guard', () => {
  for (const group of guardedWorkspaceGroups) {
    const base = `v1/workspaces/[wsId]/${group}`;
    const source = fs.readFileSync(
      path.join(
        REPO_ROOT,
        'apps/web/src/app/api',
        base,
        '[...segments]',
        'route.ts'
      ),
      'utf8'
    );
    assert.ok(
      source.includes(
        `import { guard } from '@/legacy-api-routes/${base}/route-guard';`
      ),
      `${group} wrapper imports its guard`
    );
    assert.match(
      source,
      /createWorkspaceRouteHandlers\(\s*\[[\s\S]*\],\s*guard\s*\);/u
    );
    assert.ok(
      fs.existsSync(
        path.join(
          REPO_ROOT,
          'apps/web/src/legacy-api-routes',
          base,
          'route-guard.ts'
        )
      )
    );
  }
  assert.ok(guardedWorkspaceGroups.includes('external-apps'));
});

test('repo import graph keeps legacy API routes concrete without catch-all bridges', () => {
  const apiDir = path.join(REPO_ROOT, 'apps', 'web', 'src', 'app', 'api');
  const bridgeFiles = [];
  const previewRoutes = new Map([
    [
      'v1/meetings/[meetingId]/collaboration/preview/[port]/[[...path]]/route.ts',
      'previewMeetingPlayground',
    ],
    [
      'v1/users/me/playgrounds/[projectId]/preview/[port]/[[...path]]/route.ts',
      'playgroundPreviewResponse',
    ],
  ]);
  const previewFiles = [];

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
        const relativePath = path
          .relative(apiDir, entryPath)
          .split(path.sep)
          .join('/');
        const previewHandler = previewRoutes.get(relativePath);
        if (previewHandler) {
          const source = fs.readFileSync(entryPath, 'utf8');
          assert.doesNotMatch(source, /legacy-api-routes/);
          assert.match(source, /withSessionAuth/);
          assert.ok(source.includes(previewHandler), relativePath);
          previewFiles.push(relativePath);
        } else {
          bridgeFiles.push(entryPath);
        }
      }
    }
  }

  walk(apiDir);
  assert.deepEqual(previewFiles.sort(), [...previewRoutes.keys()].sort());

  assert.deepEqual(
    bridgeFiles.map((filePath) => path.relative(REPO_ROOT, filePath)),
    []
  );
});
