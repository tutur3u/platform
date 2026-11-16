import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

const emptyNestedResources = {
  durable_objects: { bindings: [] },
  queues: { producers: [], consumers: [] },
  logfwdr: { bindings: [] },
};
const resourceKeys = [
  'services',
  'kv_namespaces',
  'd1_databases',
  'r2_buckets',
  'durable_objects',
  'queues',
  'logfwdr',
  'secrets_store_secrets',
  'secrets',
  'bindings',
  'workflows',
  'containers',
  'hyperdrive',
  'unsafe',
  'send_email',
  'cloudchamber',
  'connect',
  'migrations',
  'exports',
  'vectorize',
  'ai_search_namespaces',
  'ai_search',
  'agent_memory',
  'analytics_engine_datasets',
  'dispatch_namespaces',
  'mtls_certificates',
  'tail_consumers',
  'streaming_tail_consumers',
  'browser',
  'analytics',
  'ai',
  'images',
  'stream',
  'media',
  'pipelines',
  'k2',
  'artifacts',
  'worker_loaders',
  'ratelimits',
  'vpc_services',
  'vpc_networks',
  'version_metadata',
];

export function assertNoPublicResources(config) {
  for (const key of resourceKeys) {
    const value = config[key];
    if (value === undefined) continue;
    const empty = isDeepStrictEqual(value, []) || isDeepStrictEqual(value, {});
    const nestedDefault =
      Object.hasOwn(emptyNestedResources, key) &&
      isDeepStrictEqual(value, emptyNestedResources[key]);
    assert.ok(empty || nestedDefault, 'Unexpected Playground resource: ' + key);
  }
}
