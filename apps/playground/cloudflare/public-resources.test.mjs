import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNoPublicResources } from './public-resources.mjs';

test('admits only empty resource containers, including emitted nested defaults', () => {
  assert.doesNotThrow(() => assertNoPublicResources({}));
  assert.doesNotThrow(() =>
    assertNoPublicResources({
      services: [],
      kv_namespaces: [],
      d1_databases: [],
      r2_buckets: [],
      durable_objects: { bindings: [] },
      queues: { producers: [], consumers: [] },
      logfwdr: { bindings: [] },
      secrets_store_secrets: [],
    })
  );
});

test('rejects actual bindings and unreviewed nested configuration', () => {
  const forbidden = [
    {
      durable_objects: {
        bindings: [{ name: 'EXAMPLE', class_name: 'Example' }],
      },
    },
    { durable_objects: { bindings: [], unexpected: [] } },
    {
      queues: {
        producers: [{ binding: 'EXAMPLE', queue: 'example' }],
        consumers: [],
      },
    },
    { queues: { producers: [], consumers: [{ queue: 'example' }] } },
    { queues: { producers: [], consumers: [], unexpected: [] } },
    { logfwdr: { bindings: [{ name: 'EXAMPLE' }] } },
    { services: [{ binding: 'EXAMPLE', service: 'example' }] },
    { kv_namespaces: [{ binding: 'EXAMPLE', id: 'synthetic' }] },
    { secrets_store_secrets: [{ binding: 'EXAMPLE' }] },
    { secrets: [{ name: 'EXAMPLE' }] },
    { ai: { binding: 'EXAMPLE' } },
    { browser: { binding: 'EXAMPLE' } },
    { version_metadata: { binding: 'EXAMPLE' } },
    { durable_objects: false },
    { queues: null },
  ];
  for (const config of forbidden) {
    assert.throws(
      () => assertNoPublicResources(config),
      /Unexpected Playground resource/
    );
  }
});

test('failure diagnostics disclose the resource key without its values', () => {
  assert.throws(
    () =>
      assertNoPublicResources({
        secrets: [{ name: 'EXAMPLE', value: 'synthetic-must-not-appear' }],
      }),
    (error) =>
      error.message.includes('secrets') &&
      !error.message.includes('synthetic-must-not-appear')
  );
});
