// Binding vocabulary for the Worker settings readback. Labels print only
// names and types reviewed here or declared by the identity, never free-form
// server text.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

// Server identifiers are printed only when they equal a name we already
// trust: a declared binding of this identity, or a constant reviewed here.
// A syntactically valid identifier can still be a credential.
export const KNOWN_BINDING_TYPES = new Set([
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

export function declaredNames(identity) {
  return new Set([
    ...Object.keys(identity.vars ?? {}),
    ...Object.keys(identity.durableObjects ?? {}),
    ...Object.keys(identity.services ?? {}),
    ...(identity.secrets ?? []),
  ]);
}

export function bindingLabel(name, declared, index) {
  return declared.has(name) ? name : `<undeclared binding #${index + 1}>`;
}

export function typeLabel(type) {
  return KNOWN_BINDING_TYPES.has(type) ? type : '<unknown type>';
}

export function attributeLabel(attribute) {
  return KNOWN_BINDING_ATTRIBUTES.has(attribute)
    ? attribute
    : '<unknown attribute>';
}

// Maps and Sets only: binding names such as `__proto__` must not reach an
// object prototype chain.
export const REVIEWED_BINDING_ATTRIBUTES = new Map([
  ['plain_text', new Set(['name', 'type', 'text'])],
  ['secret_text', new Set(['name', 'type'])],
  // namespace_id is assigned by Cloudflare; script_name is checked below.
  [
    'durable_object_namespace',
    new Set(['name', 'type', 'class_name', 'script_name', 'namespace_id']),
  ],
  // Service bindings to another Worker's named entrypoint.
  [
    'service',
    new Set(['name', 'type', 'service', 'entrypoint', 'environment']),
  ],
]);

/** A live service binding as [name, target]; it must be declared and production. */
export function readServiceBinding(binding, identity, label) {
  assert.ok(
    Object.hasOwn(identity.services ?? {}, binding.name),
    `undeclared service binding ${label}`
  );
  assert.ok(
    binding.environment === undefined ||
      binding.environment === null ||
      binding.environment === 'production',
    `service binding ${label} targets another environment`
  );
  return [
    binding.name,
    { service: binding.service, entrypoint: binding.entrypoint ?? undefined },
  ];
}

const sortedTargets = (entries) =>
  [...entries]
    .map(([name, { service, entrypoint }]) => [name, service, entrypoint])
    .sort(([left], [right]) => left.localeCompare(right));

/** Live service bindings must equal the identity's declared targets. */
export function assertServiceBindings(observed, identity) {
  assert.ok(
    isDeepStrictEqual(
      sortedTargets(observed),
      sortedTargets(Object.entries(identity.services ?? {}))
    ),
    'service bindings differ'
  );
}
