import assert from 'node:assert/strict';

// The emitted-config fields the Void converter reproduces. Every other key
// must be emitter metadata or an empty group, so a new binding, trigger or
// setting fails the conversion instead of disappearing from a release.

const TRANSLATED = new Set([
  'name',
  'main',
  'account_id',
  'compatibility_date',
  'compatibility_flags',
  'no_bundle',
  'workers_dev',
  'preview_urls',
  'upload_source_maps',
  'vars',
  'secrets',
  'assets',
  'services',
  'r2_buckets',
  'kv_namespaces',
  'd1_databases',
  'analytics_engine_datasets',
  'images',
  'durable_objects',
  'migrations',
  'placement',
  'limits',
  'observability',
  'rules',
  // Routes and custom domains stay configured on the Worker; versions never
  // change them.
  'routes',
]);

/** Emitter and local-development metadata with no deployed effect. */
const METADATA = new Set([
  'configPath',
  'userConfigPath',
  'topLevelName',
  'definedEnvironments',
  'jsx_factory',
  'jsx_fragment',
  'dev',
  'python_modules',
]);

const FIELDS = {
  placement: ['region', 'mode'],
  limits: ['cpu_ms'],
  assets: [
    'directory',
    'binding',
    'run_worker_first',
    'not_found_handling',
    'html_handling',
  ],
  observability: ['enabled', 'head_sampling_rate', 'logs'],
  secrets: ['required'],
  durable_objects: ['bindings'],
};

const ENTRY_FIELDS = {
  services: ['binding', 'service', 'entrypoint'],
  r2_buckets: ['binding', 'bucket_name', 'jurisdiction'],
  kv_namespaces: ['binding', 'id'],
  d1_databases: ['binding', 'database_id', 'database_name'],
  analytics_engine_datasets: ['binding', 'dataset'],
  images: ['binding'],
};

const DEFAULT_RULES = JSON.stringify([
  { type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] },
]);

export function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object')
    return Object.values(value).every((entry) => isEmpty(entry));
  return false;
}

function onlyFields(label, value, allowed) {
  if (value === undefined || value === null) return;
  for (const key of Object.keys(value))
    assert.ok(allowed.includes(key), `unsupported ${label} field ${key}`);
}

/** Fail on any emitted setting the converter would not reproduce. */
export function assertSupportedConfig(config) {
  for (const [key, value] of Object.entries(config)) {
    if (TRANSLATED.has(key) || METADATA.has(key)) continue;
    assert.ok(isEmpty(value), `unsupported non-empty config ${key}`);
  }
  for (const [key, allowed] of Object.entries(FIELDS))
    onlyFields(key, config[key], allowed);
  for (const [key, allowed] of Object.entries(ENTRY_FIELDS)) {
    const entries = Array.isArray(config[key])
      ? config[key]
      : config[key]
        ? [config[key]]
        : [];
    for (const entry of entries) onlyFields(key, entry, allowed);
  }
  for (const entry of config.durable_objects?.bindings ?? [])
    onlyFields('durable_objects.bindings', entry, [
      'name',
      'class_name',
      'script_name',
    ]);
  if (config.rules !== undefined)
    assert.equal(
      JSON.stringify(config.rules),
      DEFAULT_RULES,
      'unsupported module rules'
    );
  if (config.observability?.logs !== undefined)
    onlyFields('observability.logs', config.observability.logs, [
      'enabled',
      'head_sampling_rate',
      'invocation_logs',
    ]);
}
