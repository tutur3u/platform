import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// A Worker app serves its production host only when that host is in the
// `rootHosts` that reach the bridge handler. The Worker entry sets a default
// and then spreads `appConfig.mounts`; a config list that omits the default
// replaces it, and with `unknownHost: 'reject'` the production host answers
// 404. This sweep reads each app's sources and fails when the production host
// is missing from the effective list.

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const appsDir = join(root, 'apps');

// Apps whose canonical production host is not `<directory>.tuturuuu.com`.
const PRODUCTION_HOST = {};

// Apps with a confirmed gap, reported by the sweep and kept out of the
// assertion until the app's own host change lands. Each entry fails the test
// once the gap is closed, so the entry is removed with the fix.
const KNOWN_GAPS = {
  storefront:
    "the config list replaces the Worker default 'storefront.tuturuuu.com'",
};

// Apps the sweep must cover; a refactor that hides their host list fails here
// instead of silently dropping the check.
const REQUIRED = [
  'nova',
  'mind',
  'rewise',
  'cms',
  'pay',
  'finance',
  'storefront',
  'track',
];

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function stringLiterals(text) {
  return [...text.matchAll(/'([^'\n]+)'/gu)].map((match) => match[1]);
}

// Position and source text of the first `rootHosts: <expression>` property.
function rootHostsProperty(source) {
  const start = source.indexOf('rootHosts');
  if (start < 0) return null;
  const colon = source.indexOf(':', start);
  let depth = 0;
  let end = colon + 1;
  for (; end < source.length; end += 1) {
    const char = source[end];
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) {
      if (depth === 0) break;
      depth -= 1;
    } else if (char === ',' && depth === 0) break;
  }
  return { index: start, expression: source.slice(colon + 1, end) };
}

// String literals of the expression, plus those of any array constant it
// spreads (`[...TRACK_ROOT_HOSTS]`).
function configuredLiterals(config, expression) {
  const hosts = stringLiterals(expression);
  for (const [, name] of expression.matchAll(/\.\.\.([A-Z_a-z]\w*)/gu)) {
    const declaration = config.match(
      new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`, 'u')
    );
    if (declaration) hosts.push(...stringLiterals(declaration[1]));
  }
  return hosts;
}

export function evaluateRootHosts(worker, config, profileHosts = []) {
  const defaults = rootHostsProperty(worker);
  if (!defaults) return null;
  const configured = rootHostsProperty(config);
  const configuredHosts = [
    ...(configured ? configuredLiterals(config, configured.expression) : []),
    ...profileHosts,
  ];
  const workerHosts = stringLiterals(defaults.expression);
  const spreadAt = worker.search(/\.\.\.appConfig\.mounts\b/u);
  // A later spread of a config that sets `rootHosts` replaces the default.
  const configOverrides = configured !== null && spreadAt > defaults.index;
  return configOverrides
    ? configuredHosts
    : [...new Set([...workerHosts, ...configuredHosts])];
}

function profileRootHosts(app) {
  const directory = join(appsDir, app, 'cloudflare');
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => /^native-profiles?\.json$/u.test(name))
    .map((name) => JSON.parse(read(join(directory, name))).production?.rootHost)
    .filter(Boolean);
}

function appRootHosts(app) {
  return evaluateRootHosts(
    read(join(appsDir, app, 'cloudflare/worker.ts')),
    read(join(appsDir, app, 'start-bridge.config.ts')),
    profileRootHosts(app)
  );
}

const apps = readdirSync(appsDir).filter((name) =>
  existsSync(join(appsDir, name, 'cloudflare/worker.ts'))
);

test('the sweep covers the required Worker apps', () => {
  for (const app of REQUIRED)
    assert.ok(appRootHosts(app), `${app} has no readable rootHosts`);
});

for (const app of apps) {
  const hosts = appRootHosts(app);
  if (!hosts) continue;
  const production = PRODUCTION_HOST[app] ?? `${app}.tuturuuu.com`;
  if (KNOWN_GAPS[app]) {
    test(`${app} known gap is still open: ${KNOWN_GAPS[app]}`, () => {
      assert.ok(
        !hosts.includes(production),
        `${app} now serves ${production}; remove it from KNOWN_GAPS`
      );
    });
    continue;
  }
  test(`${app} serves its production host ${production}`, () => {
    assert.ok(
      hosts.includes(production),
      `${app} effective rootHosts ${JSON.stringify(hosts)} lack ${production}`
    );
  });
}

test('nova serves the production host and keeps its other hosts', () => {
  const hosts = appRootHosts('nova');
  for (const host of ['nova.tuturuuu.com', 'nova.tutur3u.com', 'nova.ai.vn'])
    assert.ok(hosts.includes(host), `nova lacks ${host}`);
});

test('a config list replaces a Worker default that is spread first', () => {
  const worker = `mounts: { rootHosts: ['a.tuturuuu.com'], ...appConfig.mounts }`;
  const config = `mounts: { rootHosts: ['a.tutur3u.com'] }`;
  assert.deepEqual(evaluateRootHosts(worker, config), ['a.tutur3u.com']);
});

test('a Worker list set after the config spread is kept with the config hosts', () => {
  const worker = `mounts: { ...appConfig.mounts, rootHosts: [...new Set(['a.tuturuuu.com', ...(appConfig.mounts.rootHosts ?? [])])] }`;
  const config = `mounts: { rootHosts: ['a.tutur3u.com'] }`;
  assert.deepEqual(evaluateRootHosts(worker, config), [
    'a.tuturuuu.com',
    'a.tutur3u.com',
  ]);
});

test('a config list that spreads a constant counts the constant', () => {
  const worker = `mounts: { rootHosts: ['a.tuturuuu.com'], ...appConfig.mounts }`;
  const config = `const HOSTS = ['a.tuturuuu.com'] as const;\nmounts: { rootHosts: [...HOSTS, ...staging] }`;
  assert.deepEqual(evaluateRootHosts(worker, config), ['a.tuturuuu.com']);
});

test('a config without hosts leaves the Worker default', () => {
  const worker = `mounts: { rootHosts: ['a.tuturuuu.com'], ...appConfig.mounts }`;
  assert.deepEqual(evaluateRootHosts(worker, `mounts: {}`), ['a.tuturuuu.com']);
});
