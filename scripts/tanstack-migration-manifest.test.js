const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  checkManifest,
  extractRouteMethods,
  inventoryNextAppRoutes,
  readRouteOverrides,
  routePathFromDirectory,
  writeManifest,
} = require('./tanstack-migration-manifest.js');
const {
  summarizeMigrationProgress,
} = require('./tanstack-migration-progress.js');

function makeTempFixture() {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'tanstack-migration-manifest-')
  );
  const appDir = path.join(rootDir, 'apps', 'web', 'src', 'app');

  fs.mkdirSync(
    path.join(appDir, '[locale]', '(dashboard)', '[wsId]', 'tasks', '[taskId]'),
    { recursive: true }
  );
  fs.mkdirSync(path.join(appDir, 'api', 'cron', 'sync'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(appDir, 'api', 'health'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(appDir, '.well-known', '[...slug]'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(appDir, 'serwist', '[path]'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(appDir, '[locale]', '(dashboard)', '[wsId]', 'tasks', 'page.tsx'),
    'export default function Page() { return null }'
  );
  fs.writeFileSync(
    path.join(
      appDir,
      '[locale]',
      '(dashboard)',
      '[wsId]',
      'tasks',
      '[taskId]',
      'layout.tsx'
    ),
    'export default function Layout() { return null }'
  );
  fs.writeFileSync(
    path.join(appDir, 'api', 'cron', 'sync', 'route.ts'),
    'export function GET() {}\nexport const POST = GET;\n'
  );
  fs.writeFileSync(
    path.join(appDir, 'api', 'health', 'route.ts'),
    'export function GET() {}'
  );
  fs.writeFileSync(
    path.join(appDir, '.well-known', '[...slug]', 'route.ts'),
    'export async function GET() {}\nexport async function HEAD() {}\n'
  );
  fs.writeFileSync(
    path.join(appDir, 'serwist', '[path]', 'route.ts'),
    'export const { GET, dynamic, dynamicParams, revalidate } = createSerwistRoute();\n'
  );

  return { appDir, rootDir };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test('routePathFromDirectory normalizes route groups and dynamic segments', () => {
  assert.equal(
    routePathFromDirectory('[locale]/(dashboard)/[wsId]/tasks/[taskId]'),
    '/:locale/:wsId/tasks/:taskId'
  );
  assert.equal(
    routePathFromDirectory('api/files/[...path]'),
    '/api/files/*path'
  );
  assert.equal(routePathFromDirectory('docs/[[...slug]]'), '/docs/*slug?');
});

test('extractRouteMethods finds function, const, and named route exports', () => {
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

test('inventoryNextAppRoutes records current route ownership targets', () => {
  const { appDir, rootDir } = makeTempFixture();
  const manifest = inventoryNextAppRoutes({
    appDir,
    overridesPath: null,
    rootDir,
  });

  assert.equal(manifest.summary.pages, 1);
  assert.equal(manifest.summary.layouts, 1);
  assert.equal(manifest.summary.cronRoutes, 1);
  assert.equal(manifest.summary.routeHandlers, 4);
  assert.deepEqual(manifest.summary.methodCounts, {
    DELETE: 0,
    GET: 4,
    HEAD: 1,
    OPTIONS: 0,
    PATCH: 0,
    POST: 1,
    PUT: 0,
  });
  assert.equal(manifest.routes.length, 6);
  assert.equal(manifest.progress.totals.total, 6);
  assert.equal(manifest.progress.totals.remaining, 6);
  assert.equal(
    manifest.progress.byOwner.find((owner) => owner.key === 'tanstack-start')
      .remaining,
    2
  );
  assert.ok(
    manifest.routes.some(
      (route) =>
        route.kind === 'cron' &&
        route.routePath === '/api/cron/sync' &&
        route.methods.join(',') === 'GET,POST' &&
        route.targetOwner === 'rust-backend'
    )
  );
  assert.ok(
    manifest.routes.some(
      (route) =>
        route.kind === 'route-handler' &&
        route.routePath === '/.well-known/*slug' &&
        route.methods.join(',') === 'GET,HEAD' &&
        route.targetOwner === 'rust-backend'
    )
  );
  assert.ok(
    manifest.routes.some(
      (route) =>
        route.kind === 'route-handler' &&
        route.routePath === '/serwist/:path' &&
        route.methods.join(',') === 'GET' &&
        route.targetOwner === 'rust-backend'
    )
  );
});

test('checkManifest allows legacy routes during migration but blocks cutover', () => {
  const { appDir, rootDir } = makeTempFixture();
  const manifestPath = path.join(rootDir, 'route-manifest.json');
  writeManifest({ appDir, manifestPath, overridesPath: null, rootDir });

  assert.deepEqual(
    checkManifest({
      appDir,
      manifestPath,
      overridesPath: null,
      requireMigrated: false,
      rootDir,
    }),
    []
  );

  const errors = checkManifest({
    appDir,
    manifestPath,
    overridesPath: null,
    requireMigrated: true,
    rootDir,
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /Legacy routes remaining: 6/u);
});

test('route overrides preserve migrated ownership across manifest generation', () => {
  const { appDir, rootDir } = makeTempFixture();
  const manifestPath = path.join(rootDir, 'route-manifest.json');
  const overridesPath = path.join(rootDir, 'route-overrides.json');
  const routeId = 'api:/api/health:apps/web/src/app/api/health/route.ts';

  writeJson(overridesPath, {
    routes: {
      [routeId]: {
        note: 'Covered by Rust backend.',
        status: 'migrated',
        targetOwner: 'rust-backend',
      },
    },
  });

  const manifest = writeManifest({
    appDir,
    manifestPath,
    overridesPath,
    rootDir,
  });
  const healthRoute = manifest.routes.find((route) => route.id === routeId);

  assert.equal(healthRoute.status, 'migrated');
  assert.equal(healthRoute.targetOwner, 'rust-backend');
  assert.equal(manifest.progress.totals.remaining, 5);
  assert.equal(manifest.progress.totals.migrated, 1);
  assert.deepEqual(
    checkManifest({
      appDir,
      manifestPath,
      overridesPath,
      requireMigrated: false,
      rootDir,
    }),
    []
  );
  assert.equal(
    readRouteOverrides(overridesPath).get(routeId).status,
    'migrated'
  );
});

test('route overrides preserve migrated route-handler ownership', () => {
  const { appDir, rootDir } = makeTempFixture();
  const manifestPath = path.join(rootDir, 'route-manifest.json');
  const overridesPath = path.join(rootDir, 'route-overrides.json');
  const routeId =
    'route-handler:/.well-known/*slug:apps/web/src/app/.well-known/[...slug]/route.ts';

  writeJson(overridesPath, {
    routes: {
      [routeId]: {
        note: 'Covered by Rust backend.',
        status: 'migrated',
        targetOwner: 'rust-backend',
      },
    },
  });

  const manifest = writeManifest({
    appDir,
    manifestPath,
    overridesPath,
    rootDir,
  });
  const wellKnownRoute = manifest.routes.find((route) => route.id === routeId);
  const routeHandlerProgress = manifest.progress.byKind.find(
    (bucket) => bucket.key === 'route-handler'
  );

  assert.equal(wellKnownRoute.status, 'migrated');
  assert.equal(wellKnownRoute.targetOwner, 'rust-backend');
  assert.equal(routeHandlerProgress.migrated, 1);
  assert.equal(routeHandlerProgress.remaining, 1);
  assert.deepEqual(
    checkManifest({
      appDir,
      manifestPath,
      overridesPath,
      requireMigrated: false,
      rootDir,
    }),
    []
  );
});

test('route overrides reject unsupported ownership values', () => {
  const { appDir, rootDir } = makeTempFixture();
  const routeId = 'api:/api/health:apps/web/src/app/api/health/route.ts';

  assert.throws(
    () =>
      inventoryNextAppRoutes({
        appDir,
        rootDir,
        routeOverrides: new Map([
          [
            routeId,
            {
              status: 'done',
              targetOwner: 'next',
            },
          ],
        ]),
      }),
    /unsupported status: done[\s\S]*unsupported targetOwner: next/u
  );
});

test('checkManifest reports stale route ownership when overrides change', () => {
  const { appDir, rootDir } = makeTempFixture();
  const manifestPath = path.join(rootDir, 'route-manifest.json');
  const overridesPath = path.join(rootDir, 'route-overrides.json');
  const routeId = 'api:/api/health:apps/web/src/app/api/health/route.ts';

  writeManifest({
    appDir,
    manifestPath,
    overridesPath,
    rootDir,
  });
  writeJson(overridesPath, {
    routes: {
      [routeId]: {
        status: 'migrated',
        targetOwner: 'rust-backend',
      },
    },
  });

  const errors = checkManifest({
    appDir,
    manifestPath,
    overridesPath,
    requireMigrated: false,
    rootDir,
  });

  assert.match(errors.join('\n'), /Manifest progress is stale/u);
  assert.match(errors.join('\n'), /route ownership is stale/u);
});

test('summarizeMigrationProgress groups remaining work by owner and kind', () => {
  const progress = summarizeMigrationProgress([
    {
      kind: 'page',
      methods: [],
      routePath: '/:locale',
      sourceFile: 'apps/web/src/app/[locale]/page.tsx',
      status: 'migrated',
      targetOwner: 'tanstack-start',
    },
    {
      kind: 'api',
      methods: ['GET'],
      routePath: '/api/tasks',
      sourceFile: 'apps/web/src/app/api/tasks/route.ts',
      status: 'legacy-next',
      targetOwner: 'rust-backend',
    },
    {
      kind: 'layout',
      methods: [],
      routePath: '/:locale',
      sourceFile: 'apps/web/src/app/[locale]/layout.tsx',
      status: 'accepted-removal',
      targetOwner: 'tanstack-start',
    },
  ]);

  assert.deepEqual(progress.totals, {
    acceptedRemoval: 1,
    key: 'total',
    label: 'All route artifacts',
    legacyNext: 1,
    migrated: 1,
    percentComplete: 66.67,
    remaining: 1,
    terminal: 2,
    total: 3,
    unknownStatus: 0,
  });
  assert.equal(progress.byOwner[0].key, 'rust-backend');
  assert.equal(progress.byOwner[0].remaining, 1);
  assert.equal(progress.byKind[0].key, 'api');
  assert.deepEqual(progress.topLegacyRoutes, [
    {
      kind: 'api',
      methods: ['GET'],
      routePath: '/api/tasks',
      sourceFile: 'apps/web/src/app/api/tasks/route.ts',
      status: 'legacy-next',
      targetOwner: 'rust-backend',
    },
  ]);
});
