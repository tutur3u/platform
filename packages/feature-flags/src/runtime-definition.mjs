// Plain ESM so the CI lifecycle checker runs under Node without a TypeScript
// toolchain. Types live in runtime-definition.d.mts.
//
// A `runtime` block declares how a store-backed flag may be set: which rule
// scopes exist, who controls each scope, and the legacy environment variable
// that stays a read-only fallback while no stored rule exists.

export const RUNTIME_RULE_SCOPES = Object.freeze([
  'platform',
  'workspace',
  'user',
]);
export const RUNTIME_VALUE_TYPES = Object.freeze(['boolean']);
/**
 * `platform-admin`: root-workspace flag managers only. `workspace-admin`:
 * the workspace's own settings managers. `self`: the signed-in user, who may
 * only opt out of a feature another layer enabled.
 */
export const RUNTIME_CONTROLLERS = Object.freeze({
  platform: Object.freeze(['platform-admin']),
  workspace: Object.freeze(['platform-admin', 'workspace-admin']),
  user: Object.freeze(['platform-admin', 'self']),
});

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validation errors for one runtime block; empty when it is well formed. */
export function validateRuntimeDefinition(runtime) {
  if (!isPlainObject(runtime)) return ['runtime must be an object'];
  const errors = [];
  const known = new Set([
    'type',
    'scopes',
    'controllers',
    'envFallback',
    'clientExposed',
  ]);
  for (const field of Object.keys(runtime)) {
    if (!known.has(field)) errors.push(`runtime.${field} is not a known field`);
  }
  if (!RUNTIME_VALUE_TYPES.includes(runtime.type)) {
    errors.push('runtime.type must be boolean');
  }
  const scopes = runtime.scopes;
  if (
    !Array.isArray(scopes) ||
    scopes.length === 0 ||
    new Set(scopes).size !== scopes.length ||
    !scopes.every((scope) => RUNTIME_RULE_SCOPES.includes(scope))
  ) {
    errors.push('runtime.scopes must list unique platform/workspace/user');
  } else if (!scopes.includes('platform')) {
    errors.push('runtime.scopes must include platform');
  }
  const controllers = runtime.controllers;
  if (!isPlainObject(controllers)) {
    errors.push('runtime.controllers must map every scope to a controller');
  } else if (Array.isArray(scopes)) {
    for (const scope of Object.keys(controllers)) {
      if (!scopes.includes(scope)) {
        errors.push(`runtime.controllers.${scope} has no matching scope`);
      }
    }
    for (const scope of scopes) {
      const allowed = Object.hasOwn(RUNTIME_CONTROLLERS, scope)
        ? RUNTIME_CONTROLLERS[scope]
        : null;
      if (!allowed?.includes(controllers[scope])) {
        errors.push(
          `runtime.controllers.${scope} must be ${allowed?.join(' or ') ?? 'valid'}`
        );
      }
    }
  }
  if (
    runtime.envFallback !== null &&
    (typeof runtime.envFallback !== 'string' ||
      !ENV_NAME.test(runtime.envFallback))
  ) {
    errors.push('runtime.envFallback must be an env var name or null');
  }
  if (typeof runtime.clientExposed !== 'boolean') {
    errors.push('runtime.clientExposed must be a boolean');
  }
  return errors;
}
