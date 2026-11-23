import assert from 'node:assert/strict';

export const ABUSE_GUARD_SERVICE_BINDING = Object.freeze({
  binding: 'ABUSE_GUARD',
  service: 'tuturuuu-abuse-guard',
  entrypoint: 'AbuseGuardEntrypoint',
});

export const NOVA_PRODUCTION_VARS = Object.freeze({
  TUTURUUU_NOINDEX: '0',
  NODE_ENV: 'production',
  TUTURUUU_REQUIRE_SECRETS: '1',
  NEXT_PUBLIC_APP_URL: 'https://tuturuuu.com/nova',
  NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
});

export const NOVA_QUALIFICATION_SOURCE_VARS = Object.freeze({
  TUTURUUU_NOINDEX: '1',
});

export const REWISE_PRODUCTION_VARS = Object.freeze({
  TUTURUUU_NOINDEX: '0',
});

export const REWISE_QUALIFICATION_SOURCE_VARS = Object.freeze({
  TUTURUUU_NOINDEX: '1',
});

export const AI_SOURCE_VARS = Object.freeze({
  TUTURUUU_NOINDEX: '1',
});

const ABUSE_GUARD_APPS = new Set(['calendar', 'finance', 'nova', 'rewise']);

export function validateAdmittedSourceServices(app, services) {
  assert.ok(Array.isArray(services));
  if (!services.length) return;
  assert.ok(
    ABUSE_GUARD_APPS.has(app),
    'Admitted source services are limited to calendar, finance, nova and rewise'
  );
  assert.deepEqual(services, [ABUSE_GUARD_SERVICE_BINDING]);
}

export function allowsNonSecretVarName(app, name) {
  return (
    name === 'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN' ||
    (app === 'nova' && name === 'TUTURUUU_REQUIRE_SECRETS')
  );
}

export function assertProductionOnlyVars(app, allowedVars, sourceVars) {
  if (!sourceVars || typeof sourceVars !== 'object') {
    throw new assert.AssertionError({ message: 'Missing source vars' });
  }
  if (app === 'nova') {
    assert.deepEqual(sourceVars, NOVA_QUALIFICATION_SOURCE_VARS);
    assert.deepEqual(allowedVars, NOVA_PRODUCTION_VARS);
    return;
  }
  if (app === 'rewise') {
    assert.deepEqual(sourceVars, REWISE_QUALIFICATION_SOURCE_VARS);
    assert.deepEqual(allowedVars, REWISE_PRODUCTION_VARS);
    return;
  }
  if (app === 'ai') {
    assert.deepEqual(sourceVars, AI_SOURCE_VARS);
    assert.deepEqual(allowedVars, AI_SOURCE_VARS);
    return;
  }
  assert.deepEqual(
    allowedVars,
    sourceVars,
    'Production-only recipes publish exactly emitted vars'
  );
}

// Apps serves noindex on every path in production, so its recipe pins the flag
// to '1' explicitly. Every other app is indexable ('0'), except ai, which may
// pin '1'.
export function assertAllowedNoindex(app, allowedVars) {
  if (app === 'apps') {
    assert.ok(
      Object.hasOwn(allowedVars, 'TUTURUUU_NOINDEX') &&
        allowedVars.TUTURUUU_NOINDEX === '1',
      'Apps production noindex flag must be 1'
    );
    return;
  }
  if (!Object.hasOwn(allowedVars, 'TUTURUUU_NOINDEX')) return;
  const value = allowedVars.TUTURUUU_NOINDEX;
  assert.ok(
    value === '0' || (app === 'ai' && value === '1'),
    'Production noindex flag'
  );
}

export function assertSourceResources(base, recipe) {
  const services = recipe.cf.admittedSourceServices ?? [];
  validateAdmittedSourceServices(recipe.app, services);
  if (services.length) {
    assert.deepEqual(
      base.services ?? [],
      services,
      'Unexpected source service bindings'
    );
  } else if (base.services?.length) {
    assert.fail('Unadmitted source resource: services');
  }
}
