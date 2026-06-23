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
  formatProgressReport,
  parseArgs: parseProgressArgs,
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

test('route overrides can split method-level ownership', () => {
  const { appDir, rootDir } = makeTempFixture();
  const manifestPath = path.join(rootDir, 'route-manifest.json');
  const overridesPath = path.join(rootDir, 'route-overrides.json');
  const routeDir = path.join(appDir, 'api', 'auth', 'mobile', 'password-login');
  const sourceFile = 'apps/web/src/app/api/auth/mobile/password-login/route.ts';
  const routeId = `api:/api/auth/mobile/password-login:${sourceFile}`;

  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(
    path.join(routeDir, 'route.ts'),
    'export function OPTIONS() {}\nexport async function POST() {}\n'
  );
  writeJson(overridesPath, {
    routes: {
      [routeId]: {
        methods: {
          OPTIONS: {
            note: 'Rust owns preflight only.',
            status: 'migrated',
            targetOwner: 'rust-backend',
          },
        },
      },
    },
  });

  const manifest = writeManifest({
    appDir,
    manifestPath,
    overridesPath,
    rootDir,
  });
  const optionsRoute = manifest.routes.find(
    (route) =>
      route.id === `api:OPTIONS:/api/auth/mobile/password-login:${sourceFile}`
  );
  const postRoute = manifest.routes.find(
    (route) =>
      route.id === `api:POST:/api/auth/mobile/password-login:${sourceFile}`
  );

  assert.equal(
    manifest.routes.some((route) => route.id === routeId),
    false
  );
  assert.equal(optionsRoute.parentId, routeId);
  assert.equal(optionsRoute.method, 'OPTIONS');
  assert.deepEqual(optionsRoute.methods, ['OPTIONS']);
  assert.equal(optionsRoute.status, 'migrated');
  assert.equal(postRoute.parentId, routeId);
  assert.equal(postRoute.method, 'POST');
  assert.deepEqual(postRoute.methods, ['POST']);
  assert.equal(postRoute.status, 'legacy-next');
  assert.equal(manifest.progress.totals.migrated, 1);
  assert.equal(manifest.progress.totals.remaining, 7);
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

test('checkManifest reports stale method-level ownership metadata', () => {
  const { appDir, rootDir } = makeTempFixture();
  const manifestPath = path.join(rootDir, 'route-manifest.json');
  const overridesPath = path.join(rootDir, 'route-overrides.json');
  const routeDir = path.join(appDir, 'api', 'auth', 'mobile', 'password-login');
  const routeId =
    'api:/api/auth/mobile/password-login:apps/web/src/app/api/auth/mobile/password-login/route.ts';

  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(
    path.join(routeDir, 'route.ts'),
    'export function OPTIONS() {}\nexport async function POST() {}\n'
  );
  writeJson(overridesPath, {
    routes: {
      [routeId]: {
        methods: {
          OPTIONS: {
            note: 'Rust owns preflight only.',
            status: 'migrated',
            targetOwner: 'rust-backend',
          },
        },
      },
    },
  });
  const manifest = writeManifest({
    appDir,
    manifestPath,
    overridesPath,
    rootDir,
  });
  const optionRoute = manifest.routes.find(
    (route) => route.method === 'OPTIONS' && route.parentId === routeId
  );
  delete optionRoute.parentId;
  writeJson(manifestPath, manifest);

  const errors = checkManifest({
    appDir,
    manifestPath,
    overridesPath,
    requireMigrated: false,
    rootDir,
  });

  assert.match(errors.join('\n'), /parentId=/u);
});

test('route overrides require evidence notes for terminal ownership', () => {
  const { appDir, rootDir } = makeTempFixture();
  const healthRouteId = 'api:/api/health:apps/web/src/app/api/health/route.ts';
  const cronRouteId =
    'cron:/api/cron/sync:apps/web/src/app/api/cron/sync/route.ts';

  assert.throws(
    () =>
      inventoryNextAppRoutes({
        appDir,
        rootDir,
        routeOverrides: new Map([
          [
            healthRouteId,
            {
              status: 'migrated',
              targetOwner: 'rust-backend',
            },
          ],
        ]),
      }),
    /Route override api:\/api\/health:apps\/web\/src\/app\/api\/health\/route\.ts with status migrated must include a non-empty note\./u
  );

  assert.throws(
    () =>
      inventoryNextAppRoutes({
        appDir,
        rootDir,
        routeOverrides: new Map([
          [
            cronRouteId,
            {
              methods: {
                POST: {
                  status: 'accepted-removal',
                  targetOwner: 'rust-backend',
                },
              },
            },
          ],
        ]),
      }),
    /Route override cron:\/api\/cron\/sync:apps\/web\/src\/app\/api\/cron\/sync\/route\.ts method POST with status accepted-removal must include a non-empty note\./u
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

test('route overrides reject unknown method ownership', () => {
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
              methods: {
                PATCH: {
                  note: 'Rust owns unsupported method metadata in this fixture.',
                  status: 'migrated',
                  targetOwner: 'rust-backend',
                },
              },
            },
          ],
        ]),
      }),
    /unknown exported method: PATCH/u
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
        note: 'Covered by Rust backend.',
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

test('tanstack migration progress CLI args support manifest and JSON output', () => {
  const args = parseProgressArgs([
    '--manifest',
    'apps/tanstack-web/migration/route-manifest.json',
    '--json',
  ]);

  assert.equal(args.format, 'json');
  assert.match(
    args.manifestPath,
    /apps\/tanstack-web\/migration\/route-manifest\.json$/u
  );
});

test('tanstack migration progress report prints owner buckets and blockers', () => {
  const progress = summarizeMigrationProgress([
    {
      kind: 'page',
      methods: [],
      routePath: '/en/about',
      sourceFile: 'apps/web/src/app/[locale]/about/page.tsx',
      status: 'migrated',
      targetOwner: 'tanstack-start',
    },
    {
      kind: 'api',
      methods: ['GET'],
      routePath: '/api/users/search',
      sourceFile: 'apps/web/src/app/api/users/search/route.ts',
      status: 'legacy-next',
      targetOwner: 'rust-backend',
    },
  ]);
  const report = formatProgressReport(
    progress,
    '/repo/apps/tanstack-web/migration/route-manifest.json'
  );

  assert.match(report, /All route artifacts: 1\/2 terminal \(50%\)/u);
  assert.match(report, /Rust backend: 0\/1 terminal \(0%\), 1 remaining/u);
  assert.match(report, /\/api\/users\/search \[api; rust-backend; GET\]/u);
});

test('TanStack Rust migration docs keep current manifest counts in sync', () => {
  const rootDir = path.resolve(__dirname, '..');
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(
        rootDir,
        'apps',
        'tanstack-web',
        'migration',
        'route-manifest.json'
      ),
      'utf8'
    )
  );
  const docs = fs.readFileSync(
    path.join(
      rootDir,
      'apps',
      'docs',
      'platform',
      'architecture',
      'tanstack-rust-migration.mdx'
    ),
    'utf8'
  );

  const expectedSnippets = [
    `- \`${manifest.summary.pages.toLocaleString('en-US')}\` pages`,
    `- \`${manifest.summary.layouts.toLocaleString('en-US')}\` layouts`,
    `- \`${manifest.summary.routeHandlers.toLocaleString('en-US')}\` route handler artifacts`,
    `- \`${manifest.summary.cronRoutes.toLocaleString('en-US')}\` cron handlers`,
    `- \`${manifest.summary.total.toLocaleString('en-US')}\` total tracked route artifacts`,
    `- \`${manifest.progress.totals.migrated.toLocaleString('en-US')}\` migrated artifacts, \`${manifest.progress.totals.terminal.toLocaleString('en-US')}\` terminal artifacts, and \`${manifest.progress.totals.remaining.toLocaleString('en-US')}\` remaining`,
  ];

  for (const expectedSnippet of expectedSnippets) {
    assert.ok(
      docs.includes(expectedSnippet),
      `missing current migration inventory snippet: ${expectedSnippet}`
    );
  }
});

test('TanStack migration plan docs stay canonical and root docs stay pointer-only', () => {
  const rootDir = path.resolve(__dirname, '..');
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(
        rootDir,
        'apps',
        'tanstack-web',
        'migration',
        'route-manifest.json'
      ),
      'utf8'
    )
  );
  const planDocs = fs.readFileSync(
    path.join(
      rootDir,
      'apps',
      'docs',
      'platform',
      'architecture',
      'tanstack-rust-migration-plan.mdx'
    ),
    'utf8'
  );
  const rootMigrationPlan = fs.readFileSync(
    path.join(rootDir, 'docs', 'MIGRATION-PLAN.md'),
    'utf8'
  );
  const rootCutoverRunbook = fs.readFileSync(
    path.join(rootDir, 'docs', 'CUTOVER-RUNBOOK.md'),
    'utf8'
  );
  const apiProgress = manifest.progress.byKind.find(
    (bucket) => bucket.key === 'api'
  );

  assert.ok(apiProgress, 'manifest must include API progress');

  const expectedPlanSnippets = [
    `| \`legacy-next\` | ${manifest.progress.totals.legacyNext} |`,
    `| \`migrated\` | ${manifest.progress.totals.migrated} |`,
    `| \`accepted-removal\` | ${manifest.progress.totals.acceptedRemoval} |`,
    `| Total tracked artifacts | ${manifest.summary.total} |`,
    `| API | ${apiProgress.legacyNext} |`,
  ];

  for (const expectedSnippet of expectedPlanSnippets) {
    assert.ok(
      planDocs.includes(expectedSnippet),
      `missing current migration plan snippet: ${expectedSnippet}`
    );
  }

  assert.match(
    rootMigrationPlan,
    /apps\/docs\/platform\/architecture\/tanstack-rust-migration-plan\.mdx/u
  );
  assert.match(
    rootCutoverRunbook,
    /apps\/docs\/build\/devops\/tanstack-rust-cutover-runbook\.mdx/u
  );

  for (const rootDoc of [rootMigrationPlan, rootCutoverRunbook]) {
    assert.doesNotMatch(rootDoc, /^## \d+\. Current State \(snapshot /mu);
    assert.doesNotMatch(rootDoc, /^\| `legacy-next` \| \d+/mu);
    assert.doesNotMatch(rootDoc, /^\| `migrated` \| \d+/mu);
    assert.doesNotMatch(rootDoc, /^\| Total route artifacts \| \d+/mu);
  }
});

test('TanStack contact route stays terminal across Rust APIs and Start page', () => {
  const rootDir = path.resolve(__dirname, '..');
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(
        rootDir,
        'apps',
        'tanstack-web',
        'migration',
        'route-manifest.json'
      ),
      'utf8'
    )
  );
  const routes = new Map(manifest.routes.map((route) => [route.id, route]));
  const terminalContactRoutes = [
    {
      id: 'api:/api/v1/inquiries:apps/web/src/app/api/v1/inquiries/route.ts',
      methods: ['POST'],
      targetOwner: 'rust-backend',
    },
    {
      id: 'api:/api/v1/users/me/profile:apps/web/src/app/api/v1/users/me/profile/route.ts',
      methods: ['GET', 'PATCH'],
      targetOwner: 'rust-backend',
    },
    {
      id: 'layout:/:locale/contact:apps/web/src/app/[locale]/(marketing)/contact/layout.tsx',
      methods: [],
      targetOwner: 'tanstack-start',
    },
    {
      id: 'page:/:locale/contact:apps/web/src/app/[locale]/(marketing)/contact/page.tsx',
      methods: [],
      targetOwner: 'tanstack-start',
    },
  ];

  for (const expected of terminalContactRoutes) {
    const route = routes.get(expected.id);

    assert.ok(route, `missing contact migration route: ${expected.id}`);
    assert.equal(route.status, 'migrated');
    assert.equal(route.targetOwner, expected.targetOwner);
    assert.deepEqual(route.methods, expected.methods);
  }
});

test('TanStack models route stays terminal across Rust API and Start page', () => {
  const rootDir = path.resolve(__dirname, '..');
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(
        rootDir,
        'apps',
        'tanstack-web',
        'migration',
        'route-manifest.json'
      ),
      'utf8'
    )
  );
  const routes = new Map(manifest.routes.map((route) => [route.id, route]));
  const terminalModelRoutes = [
    {
      id: 'api:/api/v1/infrastructure/ai/models:apps/web/src/app/api/v1/infrastructure/ai/models/route.ts',
      methods: ['GET'],
      targetOwner: 'rust-backend',
    },
    {
      id: 'page:/:locale/models:apps/web/src/app/[locale]/(marketing)/models/page.tsx',
      methods: [],
      targetOwner: 'tanstack-start',
    },
  ];

  for (const expected of terminalModelRoutes) {
    const route = routes.get(expected.id);

    assert.ok(route, `missing models migration route: ${expected.id}`);
    assert.equal(route.status, 'migrated');
    assert.equal(route.targetOwner, expected.targetOwner);
    assert.deepEqual(route.methods, expected.methods);
  }
});
