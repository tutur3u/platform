// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: deploy-only command, never cached by Turbo.
// Deploy-only readback. All requests are bounded GETs; fixtures inject fetch.
// API reference: https://developers.cloudflare.com/api/resources/workers/
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { currentDeployment } from './cf-worker-current-deployment.mjs';
import { settingsList } from './cf-worker-settings-pagination.mjs';

function canonical(value) {
  if (Array.isArray(value))
    return value
      .map(canonical)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    );
  return value;
}
const digest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

// Diagnostics never print free-form server text (error messages, bodies):
// only HTTP status, numeric error codes, our own request path and fields
// validated against a fixed shape, so no encoding of a credential can leak.
const CLOUDFLARE_ID = /^[0-9a-f]{32}$/;
const TOKEN_STATUSES = new Set(['active', 'disabled', 'expired']);

// node:assert appends actual values to custom messages; compare without a diff.
function same(actual, expected, message) {
  assert.ok(isDeepStrictEqual(actual, expected), message);
}

// Server identifiers are printed only when they equal a name we already
// trust: a declared binding of this identity, or a constant reviewed here.
// A syntactically valid identifier can still be a credential.
const KNOWN_BINDING_TYPES = new Set([
  'plain_text',
  'secret_text',
  'durable_object_namespace',
  'json',
  'kv_namespace',
  'r2_bucket',
  'd1',
  'queue',
  'service',
  'analytics_engine',
  'ai',
  'assets',
  'browser',
  'hyperdrive',
  'vectorize',
  'version_metadata',
  'dispatch_namespace',
  'workflow',
  'secrets_store_secret',
  'send_email',
  'mtls_certificate',
]);
const KNOWN_BINDING_ATTRIBUTES = new Set([
  'environment',
  'dispatch_namespace',
  'namespace_id',
  'script_name',
  'class_name',
  'text',
  'json',
]);

function declaredNames(identity) {
  return new Set([
    ...Object.keys(identity.vars ?? {}),
    ...Object.keys(identity.durableObjects ?? {}),
    ...(identity.secrets ?? []),
  ]);
}

function bindingLabel(name, declared, index) {
  return declared.has(name) ? name : `<undeclared binding #${index + 1}>`;
}

function typeLabel(type) {
  return KNOWN_BINDING_TYPES.has(type) ? type : '<unknown type>';
}

function attributeLabel(attribute) {
  return KNOWN_BINDING_ATTRIBUTES.has(attribute)
    ? attribute
    : '<unknown attribute>';
}

/** Parse a response body; a parse error would echo the body, so drop it. */
async function readJson(response, target) {
  let body;
  let parsed = false;
  try {
    body = await response.json();
    parsed = true;
  } catch {
    // The native SyntaxError quotes the body; it is deliberately discarded.
  }
  assert.ok(parsed, `settings snapshot returned malformed JSON for ${target}`);
  return body;
}

/** Numeric Cloudflare error codes from a response body, bounded. */
function errorCodes(body) {
  const codes = (Array.isArray(body?.errors) ? body.errors : [])
    .map((error) => error?.code)
    .filter((code) => Number.isSafeInteger(code))
    .slice(0, 3);
  return codes.length ? ` (codes ${codes.join(', ')})` : '';
}

async function failedResponseCodes(response) {
  try {
    return errorCodes(await response.json());
  } catch {
    return '';
  }
}

/**
 * Fingerprint of a token id: the first 12 hex of its SHA-256, computed only
 * for a well-formed 32-hex id. The raw id is response-derived and could carry
 * an encoded credential, so it is never printed or returned.
 */
export function tokenFingerprint(id) {
  return CLOUDFLARE_ID.test(id)
    ? `fp:${createHash('sha256').update(id).digest('hex').slice(0, 12)}`
    : 'fp:<invalid>';
}

/**
 * Diagnostic only: identify which API token CI used. User tokens verify at
 * /user/tokens/verify and account-owned tokens at the account endpoint. Only a
 * fingerprint of the token id and a known status are printed; operators match
 * it against `sha256(id)` of the dashboard's candidate tokens. An unverifiable
 * token is reported but left to the settings readback to fail.
 */
export async function describeToken({
  accountId,
  token,
  fetchImpl = fetch,
  log = console.log,
}) {
  if (!token) return null;
  const attempts = [];
  for (const [owner, path] of [
    ['user', '/user/tokens/verify'],
    [
      'account',
      `/accounts/${encodeURIComponent(accountId ?? '')}/tokens/verify`,
    ],
  ]) {
    if (owner === 'account' && !accountId) break;
    try {
      const response = await fetchImpl(
        `https://api.cloudflare.com/client/v4${path}`,
        {
          method: 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
          headers: { authorization: `Bearer ${token}` },
        }
      );
      if (response.ok) {
        const { result } = await response.json();
        const description = {
          owner,
          fingerprint: tokenFingerprint(result?.id),
          status: TOKEN_STATUSES.has(result?.status)
            ? result.status
            : 'unrecognized',
        };
        log(
          `Cloudflare API token ${description.fingerprint} status ${description.status} (${owner} token)`
        );
        return description;
      }
      attempts.push(
        `${owner} HTTP ${response.status}${await failedResponseCodes(response)}`
      );
    } catch (error) {
      // Local fetch failures only; their names are fixed identifiers.
      attempts.push(
        `${owner} ${/^[A-Za-z]{1,40}$/.test(error?.name) ? error.name : 'error'}`
      );
    }
  }
  log(`Cloudflare API token could not be verified: ${attempts.join('; ')}`);
  return null;
}

async function readSettings({ identity, accountId, token, fetchImpl = fetch }) {
  assert.ok(
    accountId && accountId === identity.accountId,
    'deployment account must match recorded accountId'
  );
  assert.ok(token, 'CLOUDFLARE_API_TOKEN is required');
  const account = encodeURIComponent(accountId);
  const script = `/accounts/${account}/workers/scripts/${encodeURIComponent(identity.name)}`;
  let requests = 0;
  // Diagnostics name a request by a display path built only from trusted
  // config (account, Worker) and constants; zones appear as ordinals.
  async function request(path, display = path) {
    const target = `GET ${display}`;
    assert.ok(
      ++requests <= 28,
      `settings snapshot request budget exceeded for ${target}`
    );
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4${path}`,
      {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Bearer ${token}` },
      }
    );
    if (!response.ok)
      assert.fail(
        `settings snapshot HTTP ${response.status} for ${target}` +
          (await failedResponseCodes(response))
      );
    const body = await readJson(response, target);
    assert.ok(
      body?.success === true,
      `settings snapshot API failed for ${target}${errorCodes(body)}`
    );
    return body;
  }
  async function get(path) {
    const { result } = await request(path);
    // These endpoints return one settings object, not a top-level result page.
    assert.ok(
      result && typeof result === 'object' && !Array.isArray(result),
      `settings snapshot object unavailable for GET ${path}`
    );
    return result;
  }
  const list = (path, display) => settingsList(request, path, display);
  const settings = await get(`${script}/settings`);
  const subdomain = await get(`${script}/subdomain`);
  const schedules = await get(`${script}/schedules`);
  const secrets = await list(`${script}/secrets`);
  const domains = await list(`/accounts/${account}/workers/domains`);
  const zones = await list(`/zones?account.id=${account}&per_page=50`);
  assert.ok(zones.length <= 20, 'settings snapshot supports at most 20 zones');
  const zoneRoutes = [];
  for (const [index, zone] of zones.entries()) {
    const ordinal = `zone #${index + 1}`;
    assert.ok(
      CLOUDFLARE_ID.test(zone?.id),
      `zone list returned an invalid id for ${ordinal}`
    );
    for (const route of await list(
      `/zones/${zone.id}/workers/routes`,
      `/zones/<${ordinal}>/workers/routes`
    ))
      zoneRoutes.push({ zone: zone.id, route });
  }
  const deployments = await currentDeployment(request, `${script}/deployments`);
  return {
    settings,
    subdomain,
    schedules,
    secrets,
    domains,
    zoneRoutes,
    deployments,
  };
}

// Maps and Sets only: binding names such as `__proto__` must not reach an
// object prototype chain.
const REVIEWED_BINDING_ATTRIBUTES = new Map([
  ['plain_text', new Set(['name', 'type', 'text'])],
  ['secret_text', new Set(['name', 'type'])],
  // namespace_id is assigned by Cloudflare; script_name is checked below.
  [
    'durable_object_namespace',
    new Set(['name', 'type', 'class_name', 'script_name', 'namespace_id']),
  ],
]);

/** Summarize text and Durable Object bindings; text values keep only a digest. */
function verifyBindings(settings, identity) {
  const { bindings } = settings;
  assert.ok(
    Array.isArray(bindings) && bindings.length < 100,
    'binding list unavailable'
  );
  const declaredVars = new Set(Object.keys(identity.vars ?? {}));
  const declaredObjects = new Set(Object.keys(identity.durableObjects ?? {}));
  const declared = declaredNames(identity);
  const seen = new Set();
  const vars = new Map();
  const durableObjects = new Map();
  for (const [index, binding] of bindings.entries()) {
    const name = bindingLabel(binding?.name, declared, index);
    assert.ok(
      typeof binding?.name === 'string' && !seen.has(binding.name),
      `unnamed or duplicate binding ${name}`
    );
    seen.add(binding.name);
    const reviewed = REVIEWED_BINDING_ATTRIBUTES.get(binding.type);
    assert.ok(
      reviewed,
      `unreviewed ${typeLabel(binding.type)} binding ${name}`
    );
    // Routing attributes (environment, dispatch namespace, ...) are not part
    // of the reviewed identity; any present one fails instead of being dropped.
    for (const [attribute, value] of Object.entries(binding))
      assert.ok(
        reviewed.has(attribute) || value === undefined || value === null,
        `unreviewed ${attributeLabel(attribute)} on ${typeLabel(binding.type)} binding ${name}`
      );
    switch (binding.type) {
      case 'plain_text':
        // Undeclared names fail before anything is accumulated.
        assert.ok(
          declaredVars.has(binding.name),
          `undeclared plain_text binding ${name}`
        );
        vars.set(binding.name, binding.text);
        break;
      case 'secret_text':
        // Secret values are never read; declared names are checked through
        // the secrets endpoint, which tolerates operator-installed extras.
        break;
      default:
        assert.ok(
          declaredObjects.has(binding.name),
          `undeclared durable_object_namespace binding ${name}`
        );
        assert.ok(
          binding.script_name === undefined ||
            binding.script_name === identity.name,
          `Durable Object binding ${name} targets another Worker`
        );
        durableObjects.set(binding.name, { className: binding.class_name });
    }
  }
  // Every accumulated name is declared, so differing names are trusted text;
  // values are never printed.
  const differing = [...declaredVars]
    .filter((name) => !vars.has(name) || vars.get(name) !== identity.vars[name])
    .sort();
  assert.ok(
    differing.length === 0,
    `Worker vars differ: ${differing.join(', ')}`
  );
  const observedObjects = canonical(Object.fromEntries(durableObjects));
  same(
    observedObjects,
    canonical(identity.durableObjects ?? {}),
    'Durable Object bindings differ'
  );
  const sortedVars = [...vars].sort(([a], [b]) => a.localeCompare(b));
  return {
    vars: sortedVars.map(([name]) => name),
    varsHash: digest(sortedVars),
    durableObjects: observedObjects,
  };
}

function verifySettings(raw, identity, { bindings = false } = {}) {
  const { settings, subdomain } = raw;
  same(subdomain.enabled, identity.workersDev, 'workers.dev changed');
  same(
    subdomain.previews_enabled,
    identity.previewUrls,
    'preview URL settings differ'
  );
  same(
    settings.compatibility_date,
    identity.compatibilityDate,
    'compatibility date differs'
  );
  same(
    [...(settings.compatibility_flags ?? [])].sort(),
    identity.compatibilityFlags,
    'compatibility flags differ'
  );
  const observed = settings.observability;
  assert.ok(observed, 'observability settings unavailable');
  const effective = {
    enabled: observed.enabled,
    headSamplingRate: observed.head_sampling_rate,
    logs: {
      enabled: observed.logs?.enabled ?? observed.enabled,
      headSamplingRate:
        observed.logs?.head_sampling_rate ?? observed.head_sampling_rate,
      invocationLogs: observed.logs?.invocation_logs ?? true,
    },
  };
  for (const key of ['enabled', 'headSamplingRate'])
    same(
      effective[key],
      identity.observability[key],
      `observability.${key} differs`
    );
  same(
    effective.logs,
    identity.observability.logs,
    'observability.logs differs'
  );
  const { schedules } = raw;
  assert.ok(Array.isArray(schedules.schedules), 'schedule list unavailable');
  same(
    schedules.schedules.map((entry) => entry.cron).sort(),
    identity.crons,
    'cron schedules differ'
  );
  const secrets = raw.secrets.map((entry) => entry.name).sort();
  for (const name of identity.secrets)
    assert.ok(secrets.includes(name), `missing declared secret ${name}`);
  const domains = raw.domains.filter(
    (domain) => domain.service === identity.name
  );
  const routes = raw.zoneRoutes
    .filter(({ route }) => route.script === identity.name)
    .map(({ zone, route }) => ({ zone, pattern: route.pattern }));
  // This pilot has no public routes/custom domains. Adding one needs a new profile.
  same(
    identity.routes,
    [],
    'settings snapshot profile only supports route-free Workers'
  );
  same(routes, [], 'unexpected Worker routes');
  same(domains, [], 'unexpected Worker custom domains');
  const rollback = raw.deployments;
  assert.ok(
    Array.isArray(rollback.deployments) && rollback.deployments.length > 0,
    'active deployment rollback target unavailable'
  );
  const { annotations: _annotations, ...stableSettings } = settings;
  const { bindings: _bindings, ...unboundSettings } = stableSettings;
  return {
    accountId: identity.accountId,
    worker: identity.name,
    // Bindings may include sensitive text values; retain only their digest.
    settingsHash: digest(stableSettings),
    unboundSettingsHash: digest(unboundSettings),
    ...(bindings && { bindings: verifyBindings(settings, identity) }),
    effective,
    subdomain,
    schedules: identity.crons,
    secrets,
    routes,
    domains,
    rollback: canonical(rollback.deployments),
  };
}

export async function captureSettings(options) {
  return verifySettings(await readSettings(options), options.identity);
}

/** Snapshot keys a reviewed transition may change; everything else must hold. */
const TRANSITION_SNAPSHOT_KEYS = [
  'settingsHash',
  'bindings',
  'schedules',
  'stage',
];

export function compareSettings(before, after, mutable = []) {
  const omit = (snapshot) =>
    Object.fromEntries(
      Object.entries(snapshot).filter(
        ([key]) => key !== 'rollback' && !mutable.includes(key)
      )
    );
  const current = omit(after);
  const previous = omit(before);
  const changed = [
    ...new Set([...Object.keys(current), ...Object.keys(previous)]),
  ]
    .filter((key) => !isDeepStrictEqual(current[key], previous[key]))
    .sort();
  assert.ok(
    changed.length === 0,
    `deployed Worker settings changed (${changed.join(', ')}); acceptance is blocked`
  );
}

/** Identity fields a reviewed settings transition may change. */
const TRANSITION_FIELDS = new Set([
  'crons',
  'vars',
  'durableObjects',
  'durableObjectClasses',
]);

/**
 * Resolve the expected live identities from a parity baseline. A baseline may
 * carry a reviewed `transition` from `previousIdentity` (live before the first
 * publication) to `identity` (the emitted artifact); it may change only the
 * declared fields, and each declared field must actually change.
 */
export function settingsPlan(baseline) {
  const { identity, previousIdentity, transition } = baseline;
  assert.ok(identity, 'baseline identity is required');
  if (previousIdentity === undefined && transition === undefined)
    return { target: identity };
  assert.ok(
    previousIdentity && transition,
    'a settings transition needs both previousIdentity and transition'
  );
  assert.ok(
    typeof transition.decision === 'string' && transition.decision.trim(),
    'transition.decision must name the reviewed decision'
  );
  const { fields } = transition;
  assert.ok(
    Array.isArray(fields) &&
      fields.length > 0 &&
      fields.every((field) => TRANSITION_FIELDS.has(field)),
    `transition.fields must list only ${[...TRANSITION_FIELDS].join(', ')}`
  );
  for (const key of new Set([
    ...Object.keys(identity),
    ...Object.keys(previousIdentity),
  ]))
    if (!fields.includes(key))
      assert.deepEqual(
        canonical(previousIdentity[key]),
        canonical(identity[key]),
        `transition may not change ${key}`
      );
  for (const field of fields)
    assert.notDeepEqual(
      canonical(previousIdentity[field]),
      canonical(identity[field]),
      `transition field ${field} does not change; remove it`
    );
  return { target: identity, previous: previousIdentity, transition };
}

/**
 * Verify live settings before publication. During a transition the live Worker
 * must match exactly one recorded stage: `previous` (first publication) or
 * `target` (already transitioned, e.g. a later or retried deployment).
 */
export async function captureBefore({ plan, ...credentials }) {
  if (!plan.previous)
    return captureSettings({ identity: plan.target, ...credentials });
  const raw = await readSettings({ identity: plan.target, ...credentials });
  const failures = [];
  for (const [stage, identity] of [
    ['previous', plan.previous],
    ['target', plan.target],
  ]) {
    try {
      return transitionSnapshot(raw, plan, stage, identity);
    } catch (error) {
      if (!(error instanceof assert.AssertionError)) throw error;
      failures.push(`${stage}: ${error.message}`);
    }
  }
  assert.fail(
    `live settings match no recorded transition stage (${failures.join('; ')})`
  );
}

/** Capture live settings after publication; they must match the target. */
export async function captureAfter({ plan, ...credentials }) {
  if (!plan.previous)
    return captureSettings({ identity: plan.target, ...credentials });
  const raw = await readSettings({ identity: plan.target, ...credentials });
  return transitionSnapshot(raw, plan, 'target', plan.target);
}

function transitionSnapshot(raw, plan, stage, identity) {
  return {
    ...verifySettings(raw, identity, { bindings: true }),
    stage,
    transition: plan.transition.decision,
  };
}

/**
 * Without a transition, or once live already matched the target, settings must
 * be unchanged. A first transition publication may change only the declared
 * schedules and bindings (verified against the target by captureAfter).
 */
export function compareTransition(plan, before, after) {
  if (!plan.previous) return compareSettings(before, after);
  assert.equal(
    before.transition,
    plan.transition.decision,
    'before snapshot belongs to another settings transition'
  );
  assert.equal(after.stage, 'target', 'after snapshot must match the target');
  compareSettings(
    before,
    after,
    before.stage === 'previous' ? TRANSITION_SNAPSHOT_KEYS : []
  );
}

async function main(phase, baseline, beforePath, afterPath) {
  assert.ok(
    phase === 'before' || phase === 'after',
    'usage: before <baseline> <out> | after <baseline> <before> <out>'
  );
  assert.ok(phase !== 'after' || afterPath, 'after snapshot path is required');
  const plan = settingsPlan(JSON.parse(readFileSync(baseline, 'utf8')));
  const credentials = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    token: process.env.CLOUDFLARE_API_TOKEN,
  };
  await describeToken(credentials);
  const before =
    phase === 'after' ? JSON.parse(readFileSync(beforePath, 'utf8')) : null;
  const snapshot =
    phase === 'before'
      ? await captureBefore({ plan, ...credentials })
      : await captureAfter({ plan, ...credentials });
  writeFileSync(
    phase === 'before' ? beforePath : afterPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    { mode: 0o600 }
  );
  // Persist the after evidence before the comparison can fail the job.
  if (phase === 'after') compareTransition(plan, before, snapshot);
  console.log(
    `Worker settings ${phase} snapshot verified` +
      (snapshot.stage ? ` (${snapshot.stage} identity)` : '')
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [argument] = process.argv.slice(2);
  const phase = ['before', 'after'].includes(argument) ? argument : 'settings';
  try {
    await main(...process.argv.slice(2));
  } catch (error) {
    // Assertion messages are composed here from trusted values; any other
    // error (parse, network, runtime) may quote server data, so name only it.
    const detail =
      error instanceof assert.AssertionError
        ? error.message
        : `unexpected ${/^[A-Za-z]{1,40}$/.test(error?.name) ? error.name : 'error'}`;
    console.error(`Worker settings ${phase} check failed: ${detail}`);
    process.exitCode = 1;
  }
}
