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

/** The per-secret target table. `workers(root, environment)` lists Workers. */
export const SHARED_SECRETS = Object.freeze({
  ABUSE_GUARD_SECRET: {
    vercelKey: 'ABUSE_GUARD_SECRET',
    workerBinding: 'ABUSE_GUARD_SECRETS',
    workers: (_root, environment) => [
      environment === 'production'
        ? 'tuturuuu-abuse-guard'
        : stagingName('tuturuuu-abuse-guard'),
    ],
  },
  WEB_MULTI_ACCOUNT_SESSION_SECRET: {
    vercelKey: 'WEB_MULTI_ACCOUNT_SESSION_SECRET',
    workerBinding: 'WEB_MULTI_ACCOUNT_SESSION_SECRET',
    workers: (root, environment) =>
      readFamilyWorkers(root, { authOnly: true }).map((worker) =>
        environment === 'production' ? worker : stagingName(worker)
      ),
  },
});

export function resolveSharedSecret({ secret, environment, root = '.' }) {
  assert.ok(
    Object.hasOwn(SHARED_SECRETS, secret),
    'secret must be one of the listed names'
  );
  assert.ok(ENVIRONMENTS.includes(environment), 'unknown environment');
  const entry = SHARED_SECRETS[secret];
  return {
    secret,
    environment,
    vercel: {
      projectId: VERCEL_PROJECT_ID,
      key: entry.vercelKey,
      target: VERCEL_TARGETS[environment],
      type: 'sensitive',
    },
    workers: entry.workers(root, environment).map((name) => ({
      name,
      binding: entry.workerBinding,
      type: 'secret_text',
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
