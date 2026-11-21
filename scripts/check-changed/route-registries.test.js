const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { selectLocalChecks } = require('../ci/check-map.js');
const { planChecks } = require('./plan.js');
const {
  ROUTE_REGISTRY_CHECKS,
  routeRegistrySteps,
} = require('./route-registries.js');

const ROOT = path.resolve(__dirname, '../..');
const REGISTRY_IDS = ROUTE_REGISTRY_CHECKS.map((check) => check.id);
const registriesFor = (...files) =>
  REGISTRY_IDS.filter((id) => selectLocalChecks(files).has(id));

test('a Web API route change checks every registry derived from it', () => {
  // Editing a handler changes the hash the API registry records for it, even
  // when its path and methods stay the same.
  assert.deepEqual(
    registriesFor('apps/web/src/app/api/v1/auth/cross-app-return/route.ts'),
    ['api-registry', 'web-route-manifest', 'gateway-routes']
  );
  // A file beside the handler is not hashed, but lives where routes do, so
  // it selects the checks too: a path under the route tree is never skipped.
  assert.deepEqual(
    registriesFor('apps/web/src/app/api/v1/mastermind/fleet/ship/helpers.ts'),
    ['api-registry', 'web-route-manifest', 'gateway-routes']
  );
});

test('each registry is checked for the sources that feed it, and only those', () => {
  const cases = [
    // A page is a route of the app, not of the API.
    [
      'apps/web/src/app/[locale]/(dashboard)/[wsId]/page.tsx',
      ['web-route-manifest', 'gateway-routes'],
    ],
    ['apps/api/src/routes.ts', ['api-registry']],
    ['apps/api/scripts/inventory.ts', ['api-registry']],
    // The generated files themselves: a hand edit must not survive.
    ['apps/api/generated/retained-routes.json', ['api-registry']],
    ['apps/web/start-route-manifest.json', ['web-route-manifest']],
    ['apps/gateway/src/web-routes.generated.json', ['gateway-routes']],
    // What the generators read besides the route tree.
    [
      'apps/web/cloudflare/vinext/families.json',
      ['web-route-manifest', 'gateway-routes'],
    ],
    ['apps/web/vercel.json', ['web-route-manifest']],
    ['apps/web/next.config.ts', ['web-route-manifest']],
    ['apps/web/src/proxy.ts', ['web-route-manifest']],
    ['apps/web/src/lib/satellite-api-rewrites.ts', ['web-route-manifest']],
    ['packages/utils/src/next-config.ts', ['web-route-manifest']],
    // The manifest is written through the formatter, so its configuration
    // and its installed version decide the bytes.
    ['.oxfmtrc.json', ['web-route-manifest']],
    ['bun.lock', ['web-route-manifest']],
    ['apps/web/.oxfmtrc.json', []],
    // Not route sources.
    ['apps/web/src/lib/mastermind/fleet/bridge.ts', []],
    ['apps/web/src/components/button.tsx', []],
    ['apps/mastermind/src/native/session.ts', []],
    ['packages/internal-api/src/auth.ts', []],
    ['apps/gateway/src/index.ts', []],
    ['README.md', []],
  ];
  for (const [file, expected] of cases)
    assert.deepEqual(registriesFor(file), expected, file);
});

test('the steps run the same build-free checks the workspaces define', () => {
  const steps = routeRegistrySteps(new Set(REGISTRY_IDS));
  assert.deepEqual(
    steps.map((step) => [step.id, step.command, step.cwd, step.args.at(-1)]),
    [
      ['api-registry', 'bun', 'apps/api', '--check'],
      ['web-route-manifest', 'bun', 'apps/web', '--check'],
      ['gateway-routes', 'bun', 'apps/web', '--check'],
    ]
  );
  // The command is the workspace's own check script, word for word, so the
  // gate and a manual run can never check different things.
  const scriptOf = (workspace, name) =>
    JSON.parse(
      fs.readFileSync(path.join(ROOT, workspace, 'package.json'), 'utf8')
    ).scripts[name];
  const commandOf = (id) => {
    const step = steps.find((candidate) => candidate.id === id);
    return [step.command, ...step.args].join(' ');
  };
  assert.equal(
    commandOf('api-registry'),
    scriptOf('apps/api', 'registry:check')
  );
  assert.equal(
    commandOf('web-route-manifest'),
    scriptOf('apps/web', 'routes:candidate:check')
  );
  assert.equal(
    commandOf('gateway-routes'),
    scriptOf('apps/web', 'routes:gateway:check')
  );
  // Every generator exists, and a failure says how to refresh the registry.
  for (const [index, step] of steps.entries()) {
    assert.ok(
      fs.existsSync(path.join(ROOT, step.cwd, step.args[0])),
      step.args[0]
    );
    assert.ok(step.fixHint.includes(ROUTE_REGISTRY_CHECKS[index].refresh));
    assert.equal(step.heavy, undefined);
  }
  // Nothing is planned when no registry is selected.
  assert.deepEqual(routeRegistrySteps(new Set(['i18n'])), []);
});

test('the gate plans the registry checks for a route change and not for other changes', () => {
  const context = {
    base: 'abc123',
    oxfmtBinary: '/repo/node_modules/.bin/oxfmt',
    branch: 'chore/gate',
    exists: () => false,
    hasVitest: () => true,
  };
  const planned = (status, file) =>
    planChecks([{ status, file }], context)
      .steps.map((step) => step.id)
      .filter((id) => REGISTRY_IDS.includes(id));
  const route = 'apps/web/src/app/api/v1/mastermind/fleet/threads/route.ts';
  assert.deepEqual(planned('M', route), REGISTRY_IDS);
  // A deleted route leaves its entry behind unless the registry is refreshed.
  assert.deepEqual(planned('D', route), REGISTRY_IDS);
  assert.deepEqual(planned('A', 'apps/api/src/domains/example/route.ts'), [
    'api-registry',
  ]);
  assert.deepEqual(planned('M', 'apps/web/src/lib/utils.ts'), []);
  assert.deepEqual(planned('M', 'apps/mobile/lib/main.dart'), []);
});
