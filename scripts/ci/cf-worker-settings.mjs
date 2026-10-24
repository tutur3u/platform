// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: deploy-only command, never cached by Turbo.
// Deploy-only readback. All requests are bounded GETs; fixtures inject fetch.
// API reference: https://developers.cloudflare.com/api/resources/workers/
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

async function readSettings({ identity, accountId, token, fetchImpl = fetch }) {
  assert.ok(
    accountId && accountId === identity.accountId,
    'deployment account must match recorded accountId'
  );
  assert.ok(token, 'CLOUDFLARE_API_TOKEN is required');
  const account = encodeURIComponent(accountId);
  const script = `/accounts/${account}/workers/scripts/${encodeURIComponent(identity.name)}`;
  let requests = 0;
  async function get(path) {
    assert.ok(++requests <= 28, 'settings snapshot request budget exceeded');
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4${path}`,
      {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Bearer ${token}` },
      }
    );
    assert.ok(response.ok, `settings snapshot HTTP ${response.status}`);
    const body = await response.json();
    assert.equal(body.success, true, 'settings snapshot API failed');
    assert.ok(
      (body.result_info?.total_pages ?? 1) <= 1,
      'settings snapshot refuses truncated pagination'
    );
    return body.result;
  }
  async function list(path) {
    const items = await get(path);
    assert.ok(
      Array.isArray(items) && items.length < 50,
      'settings snapshot refuses unbounded/truncated list'
    );
    return items;
  }
  const settings = await get(`${script}/settings`);
  const subdomain = await get(`${script}/subdomain`);
  const schedules = await get(`${script}/schedules`);
  const secrets = await list(`${script}/secrets`);
  const domains = await list(`/accounts/${account}/workers/domains`);
  const zones = await list(`/zones?account.id=${account}&per_page=50`);
  assert.ok(zones.length <= 20, 'settings snapshot supports at most 20 zones');
  const zoneRoutes = [];
  for (const zone of zones)
    for (const route of await list(
      `/zones/${encodeURIComponent(zone.id)}/workers/routes`
    ))
      zoneRoutes.push({ zone: zone.id, route });
  const deployments = await get(`${script}/deployments`);
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

/** Summarize text and Durable Object bindings; text values keep only a digest. */
function verifyBindings(settings, identity) {
  const { bindings } = settings;
  assert.ok(
    Array.isArray(bindings) && bindings.length < 100,
    'binding list unavailable'
  );
  const vars = {};
  const durableObjects = {};
  for (const binding of bindings) {
    switch (binding.type) {
      case 'plain_text':
        vars[binding.name] = binding.text;
        break;
      case 'secret_text':
        // Declared secret names are checked through the secrets endpoint.
        break;
      case 'durable_object_namespace':
        assert.ok(
          binding.script_name === undefined ||
            binding.script_name === identity.name,
          `Durable Object binding ${binding.name} targets another Worker`
        );
        durableObjects[binding.name] = { className: binding.class_name };
        break;
      default:
        assert.fail(`unreviewed ${binding.type} binding ${binding.name}`);
    }
  }
  // Name only the differing vars: assertion diffs would print text values.
  const expected = identity.vars ?? {};
  const differing = [
    ...new Set([...Object.keys(vars), ...Object.keys(expected)]),
  ]
    .filter((name) => vars[name] !== expected[name])
    .sort();
  assert.ok(
    differing.length === 0,
    `Worker vars differ: ${differing.join(', ')}`
  );
  assert.deepEqual(
    canonical(durableObjects),
    canonical(identity.durableObjects ?? {}),
    'Durable Object bindings differ'
  );
  return {
    vars: Object.keys(vars).sort(),
    varsHash: digest(vars),
    durableObjects: canonical(durableObjects),
  };
}

function verifySettings(raw, identity, { bindings = false } = {}) {
  const { settings, subdomain } = raw;
  assert.equal(subdomain.enabled, identity.workersDev, 'workers.dev changed');
  assert.equal(
    subdomain.previews_enabled,
    identity.previewUrls,
    'preview URL settings differ'
  );
  assert.equal(
    settings.compatibility_date,
    identity.compatibilityDate,
    'compatibility date differs'
  );
  assert.deepEqual(
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
    assert.equal(
      effective[key],
      identity.observability[key],
      `observability.${key} differs`
    );
  assert.deepEqual(
    effective.logs,
    identity.observability.logs,
    'observability.logs differs'
  );
  const { schedules } = raw;
  assert.ok(Array.isArray(schedules.schedules), 'schedule list unavailable');
  assert.deepEqual(
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
  assert.deepEqual(
    identity.routes,
    [],
    'settings snapshot profile only supports route-free Workers'
  );
  assert.deepEqual(routes, [], 'unexpected Worker routes');
  assert.deepEqual(domains, [], 'unexpected Worker custom domains');
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
  assert.deepEqual(
    omit(after),
    omit(before),
    'deployed Worker settings changed; acceptance is blocked'
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [phase, baseline, beforePath, afterPath] = process.argv.slice(2);
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
