import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const profiles = JSON.parse(
  readFileSync(new URL('./wave1-native-profiles.json', import.meta.url), 'utf8')
);
function webProfileFor(environment) {
  assert.equal(environment, 'staging', 'Web publishes to staging only');
  const web = profiles.webStaging;
  return {
    app: 'web',
    environment,
    name: web.stagingWorker,
    host: web.stagingHost,
    secrets: web.secrets,
    accountId: profiles.accountId,
  };
}
function webPublicationConfig(base, profile, { main, assets, sourceSha }) {
  const web = profiles.webStaging;
  assert.match(
    sourceSha ?? '',
    /^[a-f0-9]{40}$/u,
    'Exact Web staging source required'
  );
  assert.equal(
    base.name,
    web.sourceWorker,
    'Unexpected original Worker identity'
  );
  assert.equal(
    base.no_bundle,
    true,
    'Only prebundled native output may publish'
  );
  assert.equal(base.assets?.binding, 'ASSETS');
  assert.equal(base.assets.run_worker_first, true);
  assert.equal(base.assets.not_found_handling, 'none');
  assert.deepEqual(base.compatibility_flags, [
    'nodejs_compat',
    'global_fetch_strictly_public',
  ]);
  assert.equal(base.compatibility_date, '2026-10-19');
  assert.deepEqual(
    base.vars ?? {},
    {
      WEB_START_CANDIDATE: 'off',
      WEB_START_NATIVE_LEGAL: 'off',
      WEB_START_NATIVE_SECURITY: 'off',
      AUTH_COOKIE_DOMAIN: web.vars.AUTH_COOKIE_DOMAIN,
      NEXT_PUBLIC_SUPABASE_URL: web.vars.NEXT_PUBLIC_SUPABASE_URL,
    },
    'Source vars require explicit profile review'
  );
  for (const key of resourceKeys)
    assert.ok(empty(base[key]), `Unadmitted source resource: ${key}`);
  assert.ok(empty(base.env), 'Named source environments are not admitted');
  const config = {
    name: profile.name,
    account_id: profile.accountId,
    main,
    no_bundle: true,
    upload_source_maps: false,
    compatibility_date: base.compatibility_date,
    compatibility_flags: base.compatibility_flags,
    rules: base.rules,
    assets: { ...base.assets, directory: assets },
    workers_dev: false,
    preview_urls: false,
    routes: [],
    secrets: { required: profile.secrets },
    vars: { ...web.vars, WEB_STAGING_SOURCE_SHA: sourceSha },
    observability: { enabled: true, head_sampling_rate: 0.05 },
  };
  assertStagingIsolation(config);
  return config;
}

export function profileFor(app, environment, subdomain) {
  if (app === 'web') return webProfileFor(environment);
  assert.ok(Object.hasOwn(profiles.apps, app), 'Unknown wave-1 app');
  assert.ok(
    ['staging', 'production'].includes(environment),
    'Unknown publication environment'
  );
  const settings = profiles.apps[app];
  if (environment === 'staging' && !settings.stagingHost)
    assert.match(
      subdomain ?? '',
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
      'Owner must set CLOUDFLARE_WORKERS_SUBDOMAIN'
    );
  const name =
    environment === 'staging'
      ? settings.stagingWorker
      : settings.productionWorker;
  const host =
    environment === 'staging'
      ? (settings.stagingHost ?? `${name}.${subdomain}.workers.dev`)
      : settings.canonicalHost;
  return {
    app,
    environment,
    name,
    host,
    secrets:
      environment === 'production'
        ? app === 'calendar'
          ? [...settings.secrets, 'GOOGLE_REDIRECT_URI']
          : settings.secrets
        : // Staging-only names (Access JWT and service token) never reach production.
          [...settings.secrets, ...(settings.stagingSecrets ?? [])],
    accountId: profiles.accountId,
  };
}
const resourceKeys =
  `durable_objects migrations workflows kv_namespaces send_email queues r2_buckets d1_databases services vectorize ai hyperdrive dispatch_namespaces analytics_engine_datasets ratelimits pipelines secrets_store_secrets triggers routes images connect ai_search_namespaces ai_search agent_memory mtls_certificates k2 artifacts unsafe_hello_world flagship worker_loaders vpc_services vpc_networks assets_experiments unsafe`.split(
    ' '
  );
function empty(value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.values(value).every(empty);
  return false;
}
export function assertStagingIsolation(config) {
  assert.equal(
    config.workers_dev,
    false,
    'Staging workers.dev must be disabled'
  );
  assert.equal(
    config.preview_urls,
    false,
    'Staging preview URLs must be disabled'
  );
  assert.deepEqual(
    config.routes,
    [],
    'Staging must have no routes or custom domains'
  );
  const forbidden = Object.values(profiles.apps).flatMap((app) => [
    app.productionWorker,
    app.canonicalHost,
    ...Object.entries(app.ownerProvisionedResources ?? {})
      .filter(([key]) => key.startsWith('retainedProduction'))
      .map(([, value]) => value),
  ]);
  const check = (value) => {
    if (typeof value === 'string') {
      let identity = value;
      if (/^https?:|^wss?:/.test(value)) identity = new URL(value).hostname;
      assert.ok(
        !forbidden.includes(identity),
        'Production resource in staging profile'
      );
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) check(item);
    }
  };
  check(config);
}
export function publicationConfig(base, profile, { main, assets, sourceSha }) {
  if (profile.app === 'web')
    return webPublicationConfig(base, profile, { main, assets, sourceSha });
  const originalName =
    profile.app === 'apps'
      ? 'tuturuuu-apps-vite-staging'
      : `tuturuuu-${profile.app}`;
  assert.equal(base.name, originalName, 'Unexpected original Worker identity');
  assert.equal(
    base.no_bundle,
    true,
    'Only prebundled native output may publish'
  );
  assert.equal(base.assets?.binding, 'ASSETS');
  assert.equal(base.assets.run_worker_first, true);
  assert.equal(base.assets.not_found_handling, 'none');
  assert.deepEqual(
    base.compatibility_flags,
    profile.app === 'apps'
      ? ['nodejs_compat']
      : ['nodejs_compat', 'global_fetch_strictly_public']
  );
  assert.equal(
    base.compatibility_date,
    profile.app === 'apps' ? '2026-10-12' : '2026-10-19'
  );
  const vars =
    profile.app === 'apps'
      ? { TUTURUUU_NOINDEX: '1' }
      : profile.app === 'mail'
        ? {
            NEXT_PUBLIC_APP_URL: 'https://mail.tuturuuu.com',
            NEXT_PUBLIC_MAIL_APP_URL: 'https://mail.tuturuuu.com',
            NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
          }
        : {};
  assert.deepEqual(
    base.vars ?? {},
    vars,
    'Source vars require explicit profile review'
  );
  for (const key of resourceKeys)
    assert.ok(empty(base[key]), `Unadmitted source resource: ${key}`);
  assert.ok(empty(base.env), 'Named source environments are not admitted');
  if (base.account_id) assert.equal(base.account_id, profile.accountId);
  const production = profile.environment === 'production';
  const config = {
    name: profile.name,
    account_id: profile.accountId,
    main,
    no_bundle: true,
    upload_source_maps: false,
    compatibility_date: base.compatibility_date,
    compatibility_flags: base.compatibility_flags,
    rules: base.rules,
    assets: { ...base.assets, directory: assets },
    workers_dev: false,
    preview_urls: false,
    routes: [],
    secrets: { required: profile.secrets },
    vars: {
      ...(!production
        ? { NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN: '.staging.tutur3u.com' }
        : {}),
      NEXT_PUBLIC_APP_URL: `https://${profile.host}`,
      [`NEXT_PUBLIC_${profile.app.toUpperCase()}_APP_URL`]: `https://${profile.host}`,
      NEXT_PUBLIC_WEB_APP_URL: production
        ? 'https://tuturuuu.com'
        : 'https://web.tutur3u.com',
      ...(profile.app === 'apps'
        ? {
            APPS_CANONICAL_HOST_ENABLED: production ? '1' : '0',
            INTERNAL_WEB_API_ORIGIN: production
              ? 'https://tuturuuu.com'
              : 'https://web.tutur3u.com',
          }
        : {}),
      ...(profile.app === 'calendar'
        ? {
            ...(!production
              ? {
                  GOOGLE_REDIRECT_URI: `https://${profile.host}/api/v1/calendar/auth/callback`,
                }
              : {}),
            MICROSOFT_REDIRECT_URI: `https://${profile.host}/api/v1/calendar/auth/microsoft/callback`,
          }
        : {}),
      ...(profile.app === 'mail'
        ? {
            MAIL_R2_BUCKET_NAME: production
              ? 'tuturuuu-mail'
              : 'tuturuuu-mail-wave1-staging',
          }
        : {}),
      TUTURUUU_NOINDEX: production ? '0' : '1',
    },
    observability: { enabled: true, head_sampling_rate: 0.05 },
  };
  if (!production) assertStagingIsolation(config);
  return config;
}
