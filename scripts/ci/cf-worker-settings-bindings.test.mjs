import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertServiceBindings,
  declaredNames,
  readServiceBinding,
  REVIEWED_BINDING_ATTRIBUTES,
} from './cf-worker-settings-bindings.mjs';

const identity = {
  vars: { MODE: 'on' },
  secrets: ['TOKEN'],
  services: {
    ERASURE: { service: 'realtime-fixture', entrypoint: 'Erasure' },
  },
};
const live = (overrides = {}) => ({
  name: 'ERASURE',
  type: 'service',
  service: 'realtime-fixture',
  entrypoint: 'Erasure',
  ...overrides,
});

test('a declared service binding to the recorded entrypoint is accepted', () => {
  assert.ok(declaredNames(identity).has('ERASURE'));
  assert.deepEqual([...REVIEWED_BINDING_ATTRIBUTES.get('service')].sort(), [
    'entrypoint',
    'environment',
    'name',
    'service',
    'type',
  ]);
  for (const environment of [undefined, null, 'production'])
    assertServiceBindings(
      new Map([readServiceBinding(live({ environment }), identity, 'ERASURE')]),
      identity
    );
});

test('an undeclared or non-production service binding is refused', () => {
  assert.throws(
    () => readServiceBinding(live(), { ...identity, services: undefined }, 'x'),
    /undeclared service binding x/
  );
  assert.throws(
    () =>
      readServiceBinding(live({ environment: 'staging' }), identity, 'ERASURE'),
    /targets another environment/
  );
});

test('live service bindings must equal the declared targets', () => {
  for (const observed of [
    new Map(),
    new Map([readServiceBinding(live({ entrypoint: 'Other' }), identity, '')]),
    new Map([
      readServiceBinding(live({ service: 'another-worker' }), identity, ''),
    ]),
  ])
    assert.throws(
      () => assertServiceBindings(observed, identity),
      /service bindings differ/
    );
  assert.throws(
    () =>
      assertServiceBindings(
        new Map([readServiceBinding(live(), identity, '')]),
        { ...identity, services: {} }
      ),
    /service bindings differ/
  );
});
