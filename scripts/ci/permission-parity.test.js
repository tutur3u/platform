const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  buildInventory,
  checkInventory,
  dartPaths,
  serialize,
} = require('./permission-parity');

function fixture(
  t,
  handler,
  client = "api.get('/api/v1/workspaces/$wsId/users')"
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'permission-parity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    'apps/mobile/lib/client.dart': client,
    'apps/web/src/app/api/v1/workspaces/[wsId]/users/route.ts': handler,
    'apps/web/src/app/[locale]/[wsId]/users/page.tsx': `export default function Page() {
      if (permissions.withoutPermission('view_users_public_info')) return null;
      return null;
    }`,
  };
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), source);
  }
  return root;
}

const guarded = `export async function GET() {
  const permissions = await getPermissions({ wsId, user });
  if (!permissions) return denied();
  if (permissions.withoutPermission('view_users_public_info')) return denied();
  return data();
}`;

test('inventory records consumer, route, method, membership and UI permission', (t) => {
  const inventory = buildInventory(fixture(t, guarded));
  assert.equal(inventory.routes.length, 1);
  assert.equal(inventory.routes[0].method, 'GET');
  assert.equal(inventory.routes[0].route, '/api/v1/workspaces/[wsId]/users');
  assert.deepEqual(inventory.routes[0].permissions, ['view_users_public_info']);
  assert.deepEqual(inventory.routes[0].uiPermissions, [
    'view_users_public_info',
  ]);
  assert.equal(checkInventory(inventory).length, 0);
});

test('missing auth or missing named permission fails', (t) => {
  for (const source of [
    'export function GET() { return data(); }',
    guarded.replace(
      "if (permissions.withoutPermission('view_users_public_info')) return denied();",
      ''
    ),
    guarded.replace('if (!permissions) return denied();', ''),
  ]) {
    assert.ok(checkInventory(buildInventory(fixture(t, source))).length > 0);
  }
});

test('comments, unused functions and unused imports cannot supply a gate', (t) => {
  const source = `// getPermissions withoutPermission('view_users_public_info')
    import { getPermissions } from './unused';
    function unused() { ${guarded.replace('export async function GET()', 'async function nested()')} }
    export function GET() { return data(); }`;
  assert.ok(checkInventory(buildInventory(fixture(t, source))).length > 0);
});

test('GET authorization cannot cover an unguarded POST', (t) => {
  const inventory = buildInventory(
    fixture(t, `${guarded}\nexport function POST() { return data(); }`)
  );
  assert.ok(
    checkInventory(inventory).some((failure) => failure.includes('POST'))
  );
});

test('different API and UI permissions fail parity', (t) => {
  const inventory = buildInventory(
    fixture(t, guarded.replaceAll('view_users_public_info', 'manage_users'))
  );
  assert.ok(
    checkInventory(inventory).some((failure) =>
      failure.includes('UI permission')
    )
  );
});

test('unresolved consumed routes fail instead of disappearing', (t) => {
  const inventory = buildInventory(
    fixture(t, guarded, "api.get('/api/v1/workspaces/$wsId/missing')")
  );
  assert.ok(
    checkInventory(inventory).some((failure) => failure.includes('unresolved'))
  );
});

test('snapshot changes when a consumer changes', (t) => {
  const root = fixture(t, guarded);
  const before = serialize(buildInventory(root));
  fs.writeFileSync(
    path.join(root, 'apps/mobile/lib/other.dart'),
    "api.get('/api/v1/workspaces/$wsId/users')"
  );
  assert.notEqual(serialize(buildInventory(root)), before);
});

test('a gate inside a dead branch cannot authorize the handler', (t) => {
  const nested = guarded
    .replace(
      'export async function GET() {',
      'export async function GET() { if (false) {'
    )
    .replace('return data();', '} return data();');
  assert.ok(checkInventory(buildInventory(fixture(t, nested))).length > 0);
});

test('ignored helper results cannot authorize a handler', (t) => {
  const source =
    guarded.replace('export async function GET()', 'async function access()') +
    '\nexport async function GET() { await access(); return data(); }';
  assert.ok(checkInventory(buildInventory(fixture(t, source))).length > 0);
});

test('AND and OR permission policies are different', (t) => {
  const root = fixture(
    t,
    guarded.replace(
      "permissions.withoutPermission('view_users_public_info')",
      "permissions.withoutPermission('view_users_public_info') && permissions.withoutPermission('manage_users')"
    )
  );
  const page = path.join(
    root,
    'apps/web/src/app/[locale]/[wsId]/users/page.tsx'
  );
  fs.writeFileSync(
    page,
    "export default function Page() { if (permissions.withoutPermission('view_users_public_info') || permissions.withoutPermission('manage_users')) return null; return null; }"
  );
  assert.ok(
    checkInventory(buildInventory(root)).some((failure) =>
      failure.includes('UI permission')
    )
  );
});

test('Dart endpoint bases expand and comments do not add routes', () => {
  assert.deepEqual(
    dartPaths(
      "const base = '/api/v1/workspaces/$wsId'; final endpoint = '$base/users'; // '/api/ignored'"
    ),
    ['/api/v1/workspaces/$wsId', '/api/v1/workspaces/$wsId/users']
  );
});

test('shared route re-exports retain per-method authorization evidence', (t) => {
  const root = fixture(t, "export { GET } from './implementation';");
  fs.writeFileSync(
    path.join(
      root,
      'apps/web/src/app/api/v1/workspaces/[wsId]/users/implementation.ts'
    ),
    guarded
  );
  assert.deepEqual(checkInventory(buildInventory(root)), []);
});

test('an unawaited membership lookup cannot authorize the handler', (t) => {
  assert.ok(
    checkInventory(
      buildInventory(
        fixture(t, guarded.replace('await getPermissions', 'getPermissions'))
      )
    ).length > 0
  );
});

test('the existing CI script-test runner discovers the parity gate', () => {
  const { discoverScriptTests } = require('../run-script-tests');
  assert.ok(
    discoverScriptTests().includes('scripts/ci/permission-parity.test.js')
  );
});

test('a matching route without an exported handler fails resolution', (t) => {
  const inventory = buildInventory(
    fixture(t, "export const runtime = 'nodejs';")
  );
  assert.ok(
    checkInventory(inventory).some((failure) => failure.includes('unresolved'))
  );
});

test('checked-in permission inventory is current and every consumed workspace handler has parity', () => {
  const root = path.resolve(__dirname, '../..');
  const inventory = buildInventory(root);
  const snapshot = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'permission-parity.snapshot.json'),
      'utf8'
    )
  );
  assert.ok(
    serialize(inventory) === serialize(snapshot),
    'Run node scripts/ci/permission-parity.js --write and review the inventory diff.'
  );
  const failures = checkInventory(inventory);
  assert.equal(
    failures.length,
    0,
    failures.length +
      ' unverified checks; first 20:\n' +
      failures.slice(0, 20).join('\n')
  );
});
