// Delivery targets for the dispatch-only secret workflows
// (.github/workflows/shared-secret-write.yaml and supabase-family-key.yaml).
//
// Every identifier here is hard-coded on purpose: a dispatch chooses only a
// listed secret and a listed environment, never a free-text destination.
// Nothing in this module reads or prints a secret value.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readJsonc } from './gateway-deploy-config.mjs';

export const CLOUDFLARE_ACCOUNT_ID = 'e8912e2867beecc673d171907bf09649';
export const VERCEL_PROJECT_ID = 'prj_RlDllxkTSo5mjpzycCRQY4tGONYu';
export const SUPABASE_PROJECT_REF = 'nzamlzqfdwaaxdefwraj';
export const SUPABASE_FAMILY_KEY_NAME = 'cf-web-families';
export const SUPABASE_FAMILY_BINDING = 'SUPABASE_SECRET_KEY';

export const FAMILIES_FILE = 'apps/web/cloudflare/opennext/families.json';
// Used only while FAMILIES_FILE does not exist at the checked-out commit.
export const FALLBACK_FAMILY_WORKERS = Object.freeze([
  'tuturuuu-web-api-identity',
]);

export const ENVIRONMENTS = Object.freeze(['staging', 'production']);
// Vercel keeps staging values on the preview target of the web project.
const VERCEL_TARGETS = Object.freeze({
  production: 'production',
  staging: 'preview',
});

const WORKER_NAME = /^tuturuuu-[a-z0-9][a-z0-9-]{0,62}$/;

function assertWorkerName(name) {
  assert.ok(
    typeof name === 'string' && WORKER_NAME.test(name),
    'invalid Worker name in the family inventory'
  );
  return name;
}

/**
 * Worker names of the web route families in `families.json` (an object with a
 * `families` array of `{ worker, enabled?, auth? }`). Without the file the
 * fallback list applies; a present but malformed file fails closed.
 */
export function readFamilyWorkers(root, { authOnly = false } = {}) {
  let text;
  try {
    text = readFileSync(join(root, FAMILIES_FILE), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [...FALLBACK_FAMILY_WORKERS];
    throw error;
  }
  const { families } = JSON.parse(text);
  assert.ok(
    Array.isArray(families) && families.length > 0,
    'family inventory has no families'
  );
  const workers = families
    .filter((family) => family?.enabled !== false)
    // A family is an auth consumer unless it opts out with `auth: false`.
    .filter((family) => !authOnly || family?.auth !== false)
    .map((family) => assertWorkerName(family?.worker));
  assert.equal(
    new Set(workers).size,
    workers.length,
    'family inventory repeats a Worker'
  );
  assert.ok(workers.length > 0, 'family inventory selects no Worker');
  return workers;
}

const stagingName = (worker) => `${worker}-staging`;
const forEnvironment = (worker, environment) =>
  environment === 'production' ? worker : stagingName(worker);

const FAMILY_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

/**
 * vinext Workers of the web route families: `tuturuuu-web-vinext-<id>` for
 * each family in `families.json` that opts in with `vinext: true`. The opt-in
 * keeps a not-yet-published Worker out of every destination list, because
 * preflight refuses to write while any listed Worker is missing.
 */
export function readVinextWorkers(root) {
  let text;
  try {
    text = readFileSync(join(root, FAMILIES_FILE), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const { families } = JSON.parse(text);
  assert.ok(Array.isArray(families), 'family inventory has no families');
  const workers = families
    .filter((family) => family?.vinext === true)
    .map((family) => {
      assert.ok(
        typeof family.id === 'string' && FAMILY_ID.test(family.id),
        'invalid family id for vinext delivery'
      );
      return assertWorkerName(`tuturuuu-web-vinext-${family.id}`);
    });
  assert.equal(
    new Set(workers).size,
    workers.length,
    'family inventory repeats a vinext family'
  );
  return workers;
}

const target = (name, binding, group) => ({ name, binding, group });

/** The web side: vinext Workers carry the web project's variable name. */
const vinextTargets = (root, environment, binding) =>
  readVinextWorkers(root).map((worker) =>
    target(forEnvironment(worker, environment), binding, 'web')
  );

const peer = (worker, binding) => (_root, environment) => [
  target(forEnvironment(worker, environment), binding, 'peer'),
];

/**
 * The per-secret target table.
 *
 * `mode` says how a new destination gets the value:
 *   mint           shared-secret-write.yaml generates one value for Vercel and
 *                  every Worker target (a rotation everywhere at once)
 *   copy           the current value, held in a GitHub secret, is piped to
 *                  the web targets only with scope web (no rotation)
 *   operator-copy  the value lives on an operator host; the operator pipes it
 *                  to `write workers <secret> production web`
 * `targets(root, environment)` lists `{ name, binding, group }`, where `group`
 * is `web` (apps/web Workers) or `peer` (the other side of the protocol).
 * `environments` limits an entry whose peers have no `-staging` twin.
 */
export const SHARED_SECRETS = Object.freeze({
  ABUSE_GUARD_SECRET: {
    vercelKey: 'ABUSE_GUARD_SECRET',
    mode: 'mint',
    targets: (root, environment) => [
      ...peer('tuturuuu-abuse-guard', 'ABUSE_GUARD_SECRETS')(root, environment),
      ...vinextTargets(root, environment, 'ABUSE_GUARD_SECRET'),
    ],
  },
  WEB_MULTI_ACCOUNT_SESSION_SECRET: {
    vercelKey: 'WEB_MULTI_ACCOUNT_SESSION_SECRET',
    mode: 'mint',
    targets: (root, environment) => [
      ...readFamilyWorkers(root, { authOnly: true }).map((worker) =>
        target(
          forEnvironment(worker, environment),
          'WEB_MULTI_ACCOUNT_SESSION_SECRET',
          'web'
        )
      ),
      ...vinextTargets(root, environment, 'WEB_MULTI_ACCOUNT_SESSION_SECRET'),
    ],
  },
  ABUSE_GUARD_KEY_PEPPER: {
    vercelKey: 'ABUSE_GUARD_KEY_PEPPER',
    mode: 'mint',
    environments: ['production'],
    targets: (root, environment) => [
      // The Workers that hold the pepper today. Meet reads it as optional
      // and Mind has none, so writing one would switch their guard on.
      ...['tuturuuu-cms', 'tuturuuu-nova', 'tuturuuu-rewise'].flatMap(
        (worker) => peer(worker, 'ABUSE_GUARD_KEY_PEPPER')(root, environment)
      ),
      ...vinextTargets(root, environment, 'ABUSE_GUARD_KEY_PEPPER'),
    ],
  },
  CLOUDFLARE_COORDINATION_TOKEN: {
    vercelKey: 'CLOUDFLARE_COORDINATION_TOKEN',
    mode: 'mint',
    environments: ['production'],
    targets: (root, environment) => [
      ...peer('tuturuuu-coordination', 'COORDINATION_TOKEN')(root, environment),
      ...vinextTargets(root, environment, 'CLOUDFLARE_COORDINATION_TOKEN'),
    ],
  },
  MASTERMIND_STORE_TOKEN: {
    vercelKey: 'MASTERMIND_STORE_TOKEN',
    mode: 'mint',
    environments: ['production'],
    targets: (root, environment) => [
      ...peer('tuturuuu-mastermind-store', 'MASTERMIND_STORE_TOKENS')(
        root,
        environment
      ),
      ...vinextTargets(root, environment, 'MASTERMIND_STORE_TOKEN'),
    ],
  },
  MEET_REALTIME_TOKEN_SECRET: {
    vercelKey: 'MEET_REALTIME_TOKEN_SECRET',
    mode: 'copy',
    environments: ['production'],
    targets: (root, environment) =>
      vinextTargets(root, environment, 'MEET_REALTIME_TOKEN_SECRET'),
  },
  CRON_CONTROL_DELIVERY_TOKEN: {
    vercelKey: 'CRON_CONTROL_DELIVERY_TOKEN',
    mode: 'copy',
    environments: ['production'],
    targets: (root, environment) =>
      vinextTargets(root, environment, 'CRON_CONTROL_DELIVERY_TOKEN'),
  },
  TUTURUUU_DEVBOX_CONTROL_TOKEN: {
    vercelKey: 'TUTURUUU_DEVBOX_CONTROL_TOKEN',
    mode: 'copy',
    environments: ['production'],
    targets: (root, environment) =>
      vinextTargets(root, environment, 'TUTURUUU_DEVBOX_CONTROL_TOKEN'),
  },
  MASTERMIND_FLEET_PUBLISHER_SECRET: {
    vercelKey: 'MASTERMIND_FLEET_PUBLISHER_SECRET',
    mode: 'operator-copy',
    environments: ['production'],
    targets: (root, environment) =>
      vinextTargets(root, environment, 'MASTERMIND_FLEET_PUBLISHER_SECRET'),
  },
  MASTERMIND_PUSH_HMAC_SECRET: {
    vercelKey: 'MASTERMIND_PUSH_HMAC_SECRET',
    mode: 'operator-copy',
    environments: ['production'],
    targets: (root, environment) =>
      vinextTargets(root, environment, 'MASTERMIND_PUSH_HMAC_SECRET'),
  },
});

export const SCOPES = Object.freeze(['all', 'web']);

export function resolveSharedSecret({
  secret,
  environment,
  root = '.',
  scope = 'all',
}) {
  assert.ok(
    Object.hasOwn(SHARED_SECRETS, secret),
    'secret must be one of the listed names'
  );
  assert.ok(ENVIRONMENTS.includes(environment), 'unknown environment');
  assert.ok(SCOPES.includes(scope), 'scope must be all or web');
  const entry = SHARED_SECRETS[secret];
  assert.ok(
    (entry.environments ?? ENVIRONMENTS).includes(environment),
    `${secret} has no ${environment} destinations`
  );
  return {
    secret,
    environment,
    mode: entry.mode,
    scope,
    vercel: {
      projectId: VERCEL_PROJECT_ID,
      key: entry.vercelKey,
      target: VERCEL_TARGETS[environment],
      type: 'sensitive',
    },
    workers: entry
      .targets(root, environment)
      .filter((item) => scope === 'all' || item.group === 'web')
      .map(({ name, binding, group }) => ({
        name: assertWorkerName(name),
        binding,
        type: 'secret_text',
        group,
      })),
  };
}

function readSupabaseFamilyWorkers(root) {
  const { families } = JSON.parse(
    readFileSync(join(root, FAMILIES_FILE), 'utf8')
  );
  assert.ok(Array.isArray(families), 'family inventory has no families');
  const optedIn = families.filter((family) => family?.supabaseSecret === true);
  assert.ok(optedIn.length > 0, 'no families opted in to the Supabase key');
  const workers = optedIn.map(({ id, worker }) => {
    const name = assertWorkerName(worker);
    assert.ok(
      typeof id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(id),
      'invalid family id for Supabase key delivery'
    );
    const configPath = join(
      root,
      dirname(FAMILIES_FILE),
      'wrangler.' + id + '.jsonc'
    );
    assert.ok(existsSync(configPath), 'missing family Worker config for ' + id);
    const config = readJsonc(configPath);
    assert.ok(
      config?.name === name,
      'family Worker name does not match its config'
    );
    assert.ok(
      config.account_id === CLOUDFLARE_ACCOUNT_ID &&
        Array.isArray(config.secrets?.required) &&
        config.secrets.required.includes(SUPABASE_FAMILY_BINDING),
      'family Worker config must declare the reviewed account and require SUPABASE_SECRET_KEY'
    );
    assert.ok(
      config.vars?.APP_COORDINATION_TOKEN_DISABLE_SUPABASE_FALLBACK === '1',
      'family Worker config must disable the Supabase coordination token fallback'
    );
    return name;
  });
  assert.equal(
    new Set(workers).size,
    workers.length,
    'family inventory repeats a Worker'
  );
  return workers;
}

export function resolveSupabaseFamilyTargets(root = '.') {
  return {
    projectRef: SUPABASE_PROJECT_REF,
    keyName: SUPABASE_FAMILY_KEY_NAME,
    workers: readSupabaseFamilyWorkers(root).map((name) => ({
      name,
      binding: SUPABASE_FAMILY_BINDING,
      type: 'secret_text',
    })),
  };
}
