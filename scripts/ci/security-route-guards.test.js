const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  ENFORCED_RESULT_HELPERS,
  PUBLIC_ROUTE_ALLOWLIST,
  missingPermissionHelper,
  routeIsGuarded,
} = require('./security-route-permissions');
const { codeOnly } = require('./security-route-source');

const denialShapes = {
  authorizeCalendarEventManagement: [
    'const access = await authorizeCalendarEventManagement(request, wsId);\nif (!access.ok) return access.response;',
  ],
  authorizeFleetPublisher: [
    'const auth = await authorizeFleetPublisher(request);\nif (!auth.ok) return auth.response;',
  ],
  authorizeInfrastructureAdminRequest: [
    "const auth = await authorizeInfrastructureAdminRequest('view_infrastructure', true, request);\nif (!auth.ok) return auth.response;",
    'const access = await authorizeInfrastructureAdminRequest();\nif (!access.ok) {\n  return access.response;\n}',
  ],
  authorizeInfrastructureCron: [
    'const denied = authorizeInfrastructureCron(request);\nif (denied) return denied;',
  ],
  authorizeInfrastructureWorkspaceSecretsRequest: [
    'const auth = await authorizeInfrastructureWorkspaceSecretsRequest(req);\nif (!auth.ok) return auth.response;',
  ],
  getFinanceRouteContext: [
    'const access = await getFinanceRouteContext(req, wsId, auth);\nif (access.response) return access.response;',
  ],
  requireExternalAppWorkspaceMembersAccess: [
    'const access = await requireExternalAppWorkspaceMembersAccess(req, wsId);\nif (!access.ok) return access.response;',
  ],
  requireFinanceStatsAccess: [
    'const access = await requireFinanceStatsAccess(req, wsId);\nif (access.response) return access.response;',
  ],
  requireLearnerWorkspace: [
    'const access = await requireLearnerWorkspace(req, wsId);\nif (!access.ok) return access.response;',
  ],
  requireQaOperator: [
    'const access = await requireQaOperator(req);\nif (!access.ok) return access.response;',
  ],
  requireSepayAccess: [
    'const access = await requireSepayAccess(req, wsId);\nif (!access.ok) return access.response;',
  ],
  requireTaskProgressRowAccess: [
    'const access = await requireTaskProgressRowAccess(req, wsId);\nif (!access.ok) return access.response;',
  ],
  requireUpskiiAppCredentials: [
    'const auth = await requireUpskiiAppCredentials(req);\nif (!auth.ok) return auth.response;',
  ],
  requireWorkspaceExternalProjectAccess: [
    'const access = await requireWorkspaceExternalProjectAccess({ request: req, wsId });\nif (!access.ok) return access.response;',
  ],
  resolveLmsStaffAccess: [
    'const access = await resolveLmsStaffAccess(req, wsId);\nif (!access.ok) return access.response;',
  ],
  resolveLmsViewAccess: [
    'const access = await resolveLmsViewAccess(req, wsId);\nif (!access.ok) return access.response;',
  ],
  resolveWorkspaceRouteAccess: [
    'const access = await resolveWorkspaceRouteAccess(req, wsId);\nif (!access.ok) return access.response;',
  ],
};

const route = (body, imports = '') =>
  `${imports}export async function GET(request) {\n${body}\nreturn Response.json({});\n}`;

test('every enforced-result helper has denial-shape coverage', () => {
  assert.deepEqual(
    Object.keys(denialShapes).sort(),
    [...ENFORCED_RESULT_HELPERS].sort()
  );
});

test('every public route allowlist entry has a reason, exists, and matches its pinned digest', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  for (const [routeFile, entry] of Object.entries(PUBLIC_ROUTE_ALLOWLIST)) {
    assert.equal(typeof entry?.reason, 'string');
    assert.ok(
      entry.reason.trim().length >= 10,
      `reason too short for ${routeFile}`
    );
    const fullPath = path.join(repoRoot, routeFile);
    assert.ok(
      fs.existsSync(fullPath),
      `allowlisted public route missing on disk: ${routeFile}`
    );
    const source = fs.readFileSync(fullPath, 'utf8');
    assert.equal(
      routeIsGuarded(repoRoot, routeFile, source),
      true,
      `pinned digest mismatch for ${routeFile}`
    );
    assert.equal(
      routeIsGuarded(repoRoot, routeFile, `${source}\n// edited`),
      false,
      `modified allowlisted route should require re-review: ${routeFile}`
    );
  }
});

for (const helper of ENFORCED_RESULT_HELPERS) {
  test(`${helper} is recognized when its denial is returned`, () => {
    for (const body of denialShapes[helper])
      assert.equal(missingPermissionHelper(route(body)), false);
  });

  test(`${helper} is not recognized when only imported or referenced`, () => {
    for (const source of [
      route('', `import { ${helper} } from '@/lib/auth';\n`),
      route(`// const denied = ${helper}(request); if (denied) return denied;`),
      route(`const text = "const d = ${helper}(r); if (d) return d;";`),
      route(`const guard = ${helper};`),
    ])
      assert.equal(missingPermissionHelper(source), true);
  });

  test(`${helper} is not recognized when its result is ignored`, () => {
    for (const body of [
      `${helper}(request);`,
      `await ${helper}(request);`,
      `const auth = await ${helper}(request);\nconsole.log(auth);`,
      `const auth = await ${helper}(request);\nif (!auth.ok) console.warn(auth.response);`,
      `const auth = await ${helper}(request);\nif (auth) return auth.unused;`,
      `const auth = await ${helper}(request);\nif (!other.ok) return other.response;`,
    ])
      assert.equal(missingPermissionHelper(route(body)), true);
  });
}

test('a quote inside a regex literal cannot hide a helper call', () => {
  const source = [
    "const name = z.string().regex(/^[\\p{L} .'-]+$/u);",
    'export const GET = withSessionAuth(async () => Response.json({}));',
  ].join('\n');
  assert.equal(missingPermissionHelper(source), false);
});

test('a regex literal cannot expose helper text from a string', () => {
  const source = [
    "const pattern = /'/;",
    "const text = 'getPermissions({})';",
    'export async function GET() { return Response.json({}); }',
  ].join('\n');
  assert.equal(missingPermissionHelper(source), true);
});

test('division is not mistaken for a regex literal', () => {
  const code = codeOnly('const ratio = total / count; getPermissions(x) / 2;');
  assert.match(code, /getPermissions\(x\)/);
});

test('template text is blanked but template expressions stay code', () => {
  assert.equal(
    missingPermissionHelper('const t = `getPermissions(${id})`;'),
    true
  );
  assert.equal(
    missingPermissionHelper('const t = `${await getPermissions({ wsId })}`;'),
    false
  );
});

function fixtureRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'route-guards-'));
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), contents);
  }
  return root;
}

const reexportRoute = 'apps/meet/src/app/api/meet-call/[id]/route.ts';
const reexportSource =
  "export { POST } from '@tuturuuu/meet-core/routes/meet-call/route.ts';\n";

test('a pure re-export route is judged by the module it re-exports', () => {
  const guardedRoot = fixtureRoot({
    [reexportRoute]: reexportSource,
    'packages/meet-core/package.json': '{}',
    'packages/meet-core/src/routes/meet-call/route.ts':
      'export const POST = withSessionAuth(async () => Response.json({}));',
  });
  assert.equal(
    routeIsGuarded(guardedRoot, reexportRoute, reexportSource),
    true
  );
  const openRoot = fixtureRoot({
    [reexportRoute]: reexportSource,
    'packages/meet-core/package.json': '{}',
    'packages/meet-core/src/routes/meet-call/route.ts':
      'export async function POST() { return Response.json({}); }',
  });
  assert.equal(routeIsGuarded(openRoot, reexportRoute, reexportSource), false);
});

test('an unresolvable or mixed re-export route stays a finding', () => {
  const root = fixtureRoot({ [reexportRoute]: reexportSource });
  assert.equal(routeIsGuarded(root, reexportRoute, reexportSource), false);
  const mixed = `${reexportSource}export async function GET() { return Response.json({}); }`;
  const guardedRoot = fixtureRoot({
    'packages/meet-core/package.json': '{}',
    'packages/meet-core/src/routes/meet-call/route.ts':
      'export const POST = withSessionAuth(async () => Response.json({}));',
  });
  assert.equal(routeIsGuarded(guardedRoot, reexportRoute, mixed), false);
});

const wrapperHeader =
  '// @generated by scripts/generate-web-api-route-wrappers.js. Do not edit manually.\n\n';
const wrapperBody = [
  "import * as route0 from '@/legacy-api-routes/v1/workspaces/[wsId]/roles/route';",
  "import { createWorkspaceRouteHandlers } from '@/legacy-api-routes/workspace-route-group';",
  '',
  'export const { GET, POST } = createWorkspaceRouteHandlers([',
  '  [[], { GET: route0.GET, POST: route0.POST }],',
  ']);',
].join('\n');

const wrapperRoutePath =
  'apps/web/src/app/api/v1/workspaces/[wsId]/[[...slug]]/route.ts';

test('a generated wrapper delegates to the legacy routes it dispatches', () => {
  const root = fixtureRoot({
    'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/roles/route.ts':
      'export async function GET() { return Response.json({}); }',
  });
  assert.equal(
    routeIsGuarded(root, wrapperRoutePath, wrapperHeader + wrapperBody),
    true
  );
});

test('a wrapper header cannot hide inline handlers, foreign imports, or non-api paths', () => {
  const root = fixtureRoot({
    'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/roles/route.ts':
      'export async function GET() { return Response.json({}); }',
    'apps/web/src/legacy-api-routes/route.ts':
      'export async function GET() { return Response.json({}); }',
    'apps/web/src/legacy-api-routes/v1/evil/route/index.ts':
      'export async function GET() { return Response.json({}); }',
  });
  assert.equal(
    routeIsGuarded(
      root,
      'apps/mail/src/app/api/v1/open/route.ts',
      wrapperHeader + wrapperBody
    ),
    false
  );
  for (const source of [
    wrapperBody,
    `${wrapperHeader}${wrapperBody}\nexport const PUT = async () => Response.json({});`,
    `${wrapperHeader}import * as x from '@/lib/open';\n${wrapperBody}`,
    `${wrapperHeader}import * as x from "@/lib/open";\n${wrapperBody}`,
    `${wrapperHeader}export { GET } from "@/lib/open";\n${wrapperBody}`,
    `${wrapperHeader}${wrapperBody}\nexport const GET = require('@/lib/open').GET;`,
    `${wrapperHeader}${wrapperBody}\nclass X { static GET() { return Response.json({}); } }\nexport const GET = X.GET;`,
    `${wrapperHeader}${wrapperBody}\nconst h = { GET() { return Response.json({}); } };\nexport const GET = h.GET;`,
    `${wrapperHeader}${wrapperBody}\nexport const GET = Function('return Response.json({})');`,
    `${wrapperHeader}import * as legacyRoute from '@/legacy-api-routes/v1/open-handler';\nexport const GET = legacyRoute.GET;`,
    `${wrapperHeader}import * as legacyRoute from '@/legacy-api-routes/../lib/open';\nexport const GET = legacyRoute.GET;`,
    `${wrapperHeader}import * as legacyRoute from '@/legacy-api-routes/route';\nexport const GET = legacyRoute.GET;`,
    `${wrapperHeader}import * as legacyRoute from '@/legacy-api-routes/v1/evil/route';\nexport const GET = legacyRoute.GET;`,
    `${wrapperHeader}import * as route0 from '@/legacy-api-routes/../lib/open';\nimport { createWorkspaceRouteHandlers } from '@/legacy-api-routes/workspace-route-group';\nexport const { GET } = createWorkspaceRouteHandlers([[[], { GET: route0.GET }]]);`,
    `${wrapperHeader}import * as route0 from '@/legacy-api-routes/v1/roles/route';\nimport { guard } from '@/legacy-api-routes/../lib/route-guard';\nimport { createWorkspaceRouteHandlers } from '@/legacy-api-routes/workspace-route-group';\nexport const { GET } = createWorkspaceRouteHandlers([[[], { GET: guard }]]);`,
    `${wrapperHeader}import * as route0 from '@/legacy-api-routes/v1/roles/route';\nimport { createWorkspaceRouteHandlers } from '@/legacy-api-routes/workspace-route-group';\nexport const { GET } = createWorkspaceRouteHandlers([[[], { GET: globalThis.openHandler }]]);`,
  ])
    assert.equal(routeIsGuarded(root, wrapperRoutePath, source), false);
});
