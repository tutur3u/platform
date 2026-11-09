// Plain ESM so the CI lifecycle checker runs under Node without a TypeScript
// toolchain or installed dependencies. Types live in lifecycle.d.mts.

export const FLAG_ENVIRONMENTS = Object.freeze([
  'development',
  'staging',
  'production',
]);
export const FLAG_FAMILIES = Object.freeze([
  'mobile-runtime',
  'workspace-secret',
  'mobile-build',
]);
export const FLAG_KINDS = Object.freeze([
  'release',
  'kill-switch',
  'workspace-gate',
  'safety-control',
  'operational',
]);
export const FLAG_SCOPES = Object.freeze(['global', 'workspace', 'build']);
export const REMOVAL_GRACE_HOURS = 48;

const HOUR_MS = 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const APP_PATTERN = /^[a-z][a-z0-9-]*$/;

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function isInstant(value) {
  return (
    typeof value === 'string' &&
    INSTANT_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    isCalendarDate(value.slice(0, 10))
  );
}

/** Removal deadline for a release flag verified on production, or null. */
export function deriveRemoveBy(verifiedOnProdAt) {
  if (verifiedOnProdAt === null || verifiedOnProdAt === undefined) return null;
  if (!isInstant(verifiedOnProdAt)) return null;
  return new Date(
    Date.parse(verifiedOnProdAt) + REMOVAL_GRACE_HOURS * HOUR_MS
  ).toISOString();
}

/** A date-only legacy deadline stays valid through the end of that UTC day. */
function legacyDeadline(date) {
  return isCalendarDate(date) ? `${date}T23:59:59.999Z` : null;
}

export function getFlagLifecycle(flag, now) {
  // Only release flags expire; retained controls ignore both deadline sources.
  if (flag.kind !== 'release') {
    return { removeBy: null, removeBySource: null, status: 'retained' };
  }
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const derived = deriveRemoveBy(flag.verifiedOnProdAt);
  const legacy = legacyDeadline(flag.legacyRemoveBy ?? null);
  const removeBy = derived ?? legacy;
  const removeBySource = derived ? 'verified' : legacy ? 'legacy' : null;

  if (removeBy === null) {
    return {
      removeBy: null,
      removeBySource: null,
      status: 'awaiting-verification',
    };
  }

  return {
    removeBy,
    removeBySource,
    status: nowMs > Date.parse(removeBy) ? 'overdue' : 'scheduled',
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateFlag(flag, environments = FLAG_ENVIRONMENTS) {
  const errors = [];
  if (typeof flag !== 'object' || flag === null || Array.isArray(flag)) {
    return ['entry must be an object'];
  }
  const key = typeof flag.key === 'string' ? flag.key : '<missing key>';
  const fail = (message) => errors.push(`${key}: ${message}`);

  if (!KEY_PATTERN.test(flag.key ?? '')) fail('key is invalid');
  if (!FLAG_FAMILIES.includes(flag.family)) fail('family is invalid');
  if (!FLAG_KINDS.includes(flag.kind)) fail('kind is invalid');
  if (!FLAG_SCOPES.includes(flag.scope)) fail('scope is invalid');
  if (flag.description !== null && !isNonEmptyString(flag.description)) {
    fail('description must be a non-empty string or null');
  }
  if (flag.owner !== null && !isNonEmptyString(flag.owner)) {
    fail('owner must be a non-empty string or null');
  }
  if (flag.createdAt !== null && !isCalendarDate(flag.createdAt)) {
    fail('createdAt must be a YYYY-MM-DD date or null');
  }
  if (flag.verifiedOnProdAt !== null && !isInstant(flag.verifiedOnProdAt)) {
    fail('verifiedOnProdAt must be an ISO instant with an offset or null');
  }
  if (
    isCalendarDate(flag.createdAt) &&
    isInstant(flag.verifiedOnProdAt) &&
    flag.verifiedOnProdAt.slice(0, 10) < flag.createdAt
  ) {
    fail('verifiedOnProdAt precedes createdAt');
  }
  if (
    !Array.isArray(flag.apps) ||
    !flag.apps.every((app) => APP_PATTERN.test(app)) ||
    new Set(flag.apps).size !== flag.apps.length
  ) {
    fail('apps must be unique lowercase app slugs');
  }
  if (typeof flag.appsComplete !== 'boolean') {
    fail('appsComplete must be a boolean');
  }
  if (
    !Array.isArray(flag.sources) ||
    flag.sources.length === 0 ||
    !flag.sources.every(isNonEmptyString)
  ) {
    fail('sources must list at least one repository path');
  }
  const defaults = flag.defaults;
  if (typeof defaults !== 'object' || defaults === null) {
    fail('defaults must map every environment to a boolean');
  } else {
    const keys = Object.keys(defaults);
    if (
      keys.length !== environments.length ||
      !environments.every((env) => typeof defaults[env] === 'boolean')
    ) {
      fail('defaults must map every environment to a boolean');
    }
  }
  if (typeof flag.legacy !== 'boolean') fail('legacy must be a boolean');
  if (
    flag.legacyRemoveBy !== undefined &&
    !isCalendarDate(flag.legacyRemoveBy)
  ) {
    fail('legacyRemoveBy must be a YYYY-MM-DD date');
  }

  if (flag.legacy === false) {
    if (!isNonEmptyString(flag.owner)) fail('new flags require an owner');
    if (!isCalendarDate(flag.createdAt)) fail('new flags require createdAt');
    if (!isNonEmptyString(flag.description)) {
      fail('new flags require a description');
    }
    if (!Array.isArray(flag.apps) || flag.apps.length === 0) {
      fail('new flags require at least one app');
    }
    if (flag.appsComplete !== true) {
      fail('new flags require a complete app list');
    }
    if (flag.legacyRemoveBy !== undefined) {
      fail('new flags derive removeBy from verifiedOnProdAt');
    }
  }
  return errors;
}

export function validateCatalog(catalog) {
  if (typeof catalog !== 'object' || catalog === null) {
    return ['catalog must be an object'];
  }
  const errors = [];
  const environments = catalog.environments;
  if (
    !Array.isArray(environments) ||
    environments.length !== FLAG_ENVIRONMENTS.length ||
    !FLAG_ENVIRONMENTS.every((env, index) => environments[index] === env)
  ) {
    errors.push(`environments must equal ${FLAG_ENVIRONMENTS.join(', ')}`);
  }
  if (!Array.isArray(catalog.flags)) {
    return [...errors, 'flags must be an array'];
  }
  const seen = new Set();
  for (const flag of catalog.flags) {
    errors.push(...validateFlag(flag));
    const identity = `${flag?.family}:${flag?.key}`;
    if (seen.has(identity)) errors.push(`${flag?.key}: duplicate entry`);
    seen.add(identity);
  }
  return errors;
}

export function findOverdueFlags(catalog, now) {
  return catalog.flags
    .map((flag) => ({ flag, lifecycle: getFlagLifecycle(flag, now) }))
    .filter(({ lifecycle }) => lifecycle.status === 'overdue');
}
