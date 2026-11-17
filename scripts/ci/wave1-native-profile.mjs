import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertCommittedRecipe,
  validateReleaseRecipe,
} from './release-recipe-config.mjs';

export const profiles = JSON.parse(
  readFileSync(new URL('./wave1-native-profiles.json', import.meta.url), 'utf8')
);
export const releaseRecipes = Object.fromEntries(
  Object.entries(profiles.apps).map(([app, settings]) => {
    const recipe = validateReleaseRecipe(settings.releaseRecipe);
    assert.equal(recipe.app, app);
    return [app, recipe];
  })
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
      AUTH_COOKIE_PREFIX: web.vars.AUTH_COOKIE_PREFIX,
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
  const recipe = releaseRecipes[app];
  // A production-only app has no wave-1 staging identity; its staging artifact
  // is qualified by the app's own native workflow.
  if (recipe.cf.productionOnly)
    assert.equal(environment, 'production', `${app} publishes production only`);
  if (environment === 'staging' && !settings.stagingHost)
    assert.match(
      subdomain ?? '',
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
      'Owner must set CLOUDFLARE_WORKERS_SUBDOMAIN'
    );
  const name =
    environment === 'staging'
      ? settings.stagingWorker
      : recipe.cf.productionWorker;
  const host =
    environment === 'staging'
      ? (settings.stagingHost ?? `${name}.${subdomain}.workers.dev`)
      : new URL(recipe.canonicalHosts[0]).hostname;
  return {
    app,
    environment,
    name,
    host,
    secrets:
      environment === 'production'
        ? recipe.requiredSecretNames
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
  // Forbid both the configured identities and the resolved production
  // profile, whose Worker name can differ from `productionWorker`.
  const forbidden = Object.entries(profiles.apps).flatMap(([name, app]) => [
    app.productionWorker,
    app.canonicalHost,
    profileFor(name, 'production').name,
    profileFor(name, 'production').host,
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
  const recipe = releaseRecipes[profile.app];
  assert.ok(recipe, 'Unknown release recipe');
  if (recipe.cf.productionOnly) {
    assert.equal(profile.environment, 'production', 'Production-only recipe');
    assert.match(
      sourceSha ?? '',
      /^[a-f0-9]{40}$/u,
      `Exact ${profile.app[0].toUpperCase() + profile.app.slice(1)} production source required`
    );
  }
  const originalName = recipe.cf.sourceIdentity;
  assert.equal(base.name, originalName, 'Unexpected original Worker identity');
  assert.equal(
    base.no_bundle,
    true,
    'Only prebundled native output may publish'
  );
  assert.equal(base.assets?.binding, 'ASSETS');
  assert.equal(base.assets.run_worker_first, true);
  assert.equal(base.assets.not_found_handling, 'none');
  assert.deepEqual(base.compatibility_flags, recipe.cf.compatibilityFlags);
  assert.equal(base.compatibility_date, recipe.cf.compatibilityDate);
  assert.deepEqual(
    base.vars ?? {},
    recipe.cf.sourceVars,
    'Source vars require explicit profile review'
  );
  for (const key of resourceKeys)
    assert.ok(empty(base[key]), `Unadmitted source resource: ${key}`);
  assert.ok(empty(base.env), 'Named source environments are not admitted');
  if (base.account_id) assert.equal(base.account_id, profile.accountId);
  const production = profile.environment === 'production';
  const vars = production
    ? recipe.allowedVars
    : Object.fromEntries(
        Object.entries(recipe.cf.stagingPublicationVars).map(([key, value]) => [
          key,
          value.replaceAll('{{host}}', profile.host),
        ])
      );
  for (const name of profile.secrets)
    assert.ok(
      !Object.hasOwn(vars, name),
      `Secret name duplicates a source var: ${name}`
    );
  if (production) assert.deepEqual(recipe.requiredSecretNames, profile.secrets);
  assertCommittedRecipe(recipe);
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
    vars: { ...vars },
    observability: { enabled: true, head_sampling_rate: 0.05 },
  };
  if (!production) assertStagingIsolation(config);
  return config;
}
