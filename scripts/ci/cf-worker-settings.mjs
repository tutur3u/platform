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

export async function captureSettings({
  identity,
  accountId,
  token,
  fetchImpl = fetch,
}) {
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
  const schedules = await get(`${script}/schedules`);
  assert.ok(Array.isArray(schedules.schedules), 'schedule list unavailable');
  assert.deepEqual(
    schedules.schedules.map((entry) => entry.cron).sort(),
    identity.crons,
    'cron schedules differ'
  );
  const secrets = (await list(`${script}/secrets`))
    .map((entry) => entry.name)
    .sort();
  for (const name of identity.secrets)
    assert.ok(secrets.includes(name), `missing declared secret ${name}`);
  const domains = (await list(`/accounts/${account}/workers/domains`)).filter(
    (domain) => domain.service === identity.name
  );
  const zones = await list(`/zones?account.id=${account}&per_page=50`);
  assert.ok(zones.length <= 20, 'settings snapshot supports at most 20 zones');
  const routes = [];
  for (const zone of zones) {
    for (const route of await list(
      `/zones/${encodeURIComponent(zone.id)}/workers/routes`
    )) {
      if (route.script === identity.name)
        routes.push({ zone: zone.id, pattern: route.pattern });
    }
  }
  // This pilot has no public routes/custom domains. Adding one needs a new profile.
  assert.deepEqual(
    identity.routes,
    [],
    'settings snapshot profile only supports route-free Workers'
  );
  assert.deepEqual(routes, [], 'unexpected Worker routes');
  assert.deepEqual(domains, [], 'unexpected Worker custom domains');
  const rollback = await get(`${script}/deployments`);
  assert.ok(
    Array.isArray(rollback.deployments) && rollback.deployments.length > 0,
    'active deployment rollback target unavailable'
  );
  const { annotations: _annotations, ...stableSettings } = settings;
  return {
    accountId,
    worker: identity.name,
    // Bindings may include sensitive text values; retain only their digest.
    settingsHash: digest(stableSettings),
    effective,
    subdomain,
    schedules: identity.crons,
    secrets,
    routes,
    domains,
    rollback: canonical(rollback.deployments),
  };
}

export function compareSettings(before, after) {
  const { rollback: _old, ...previous } = before;
  const { rollback: _new, ...current } = after;
  assert.deepEqual(
    current,
    previous,
    'deployed Worker settings changed; acceptance is blocked'
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [phase, baseline, beforePath, afterPath] = process.argv.slice(2);
  assert.ok(
    phase === 'before' || phase === 'after',
    'usage: before <baseline> <out> | after <baseline> <before> <out>'
  );
  const { identity } = JSON.parse(readFileSync(baseline, 'utf8'));
  const snapshot = await captureSettings({
    identity,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    token: process.env.CLOUDFLARE_API_TOKEN,
  });
  assert.ok(phase !== 'after' || afterPath, 'after snapshot path is required');
  writeFileSync(
    phase === 'before' ? beforePath : afterPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    { mode: 0o600 }
  );
  if (phase === 'after')
    compareSettings(JSON.parse(readFileSync(beforePath, 'utf8')), snapshot);
  console.log(`Worker settings ${phase} snapshot verified`);
}
