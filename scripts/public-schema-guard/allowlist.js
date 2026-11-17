/**
 * Shrink-only allowlist of application relations that may still exist in the
 * PostgREST-exposed public schema. See
 * apps/docs/build/devops/public-schema-privatization.mdx.
 */
const ALLOWLIST_PATH = 'apps/database/public-schema-allowlist.json';
const NAME = /^[a-z_][a-z0-9_]*$/u;
const VERSION = /^\d{14}$/u;
const KINDS = new Set(['table', 'view']);

const INTRODUCED = Symbol('fieldsMissingFromSource');
const LATER_FIELDS = ['platformObjects', 'clientViewExceptions', 'typesAhead'];

class AllowlistError extends Error {}

function isWave(value) {
  return Number.isInteger(value) && value >= 0 && value <= 9;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AllowlistError(`${label} must be an object`);
  return value;
}

function requireNames(record, label, check) {
  for (const [name, entry] of Object.entries(requireObject(record, label))) {
    if (!NAME.test(name))
      throw new AllowlistError(
        `${label}: invalid name ${JSON.stringify(name)}`
      );
    requireObject(entry, `${label}.${name}`);
    check(name, entry);
  }
}

function requireReasons(record, label, keyPattern) {
  for (const [key, entry] of Object.entries(requireObject(record, label))) {
    if (!keyPattern.test(key))
      throw new AllowlistError(`${label}: invalid key ${JSON.stringify(key)}`);
    requireObject(entry, `${label}.${key}`);
    if (typeof entry.reason !== 'string' || !entry.reason.trim())
      throw new AllowlistError(`${label}.${key} needs a reason`);
  }
}

/**
 * Parse and validate allowlist text. Throws AllowlistError on any defect.
 * `base: true` reads a merge-base copy, which may still carry fields this
 * version no longer accepts in the working allowlist.
 */
function parseAllowlist(text, { base = false } = {}) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new AllowlistError(`invalid JSON: ${error.message}`);
  }
  requireObject(value, 'allowlist');
  if (value.version !== 1)
    throw new AllowlistError('unsupported allowlist version');
  if (!isWave(value.currentWave))
    throw new AllowlistError('currentWave must be an integer 0-9');
  if (
    typeof value.lintAfterVersion !== 'string' ||
    !VERSION.test(value.lintAfterVersion)
  )
    throw new AllowlistError(
      'lintAfterVersion must be a 14-digit migration version'
    );
  requireNames(value.relations, 'relations', (name, entry) => {
    if (!KINDS.has(entry.kind) || !isWave(entry.wave))
      throw new AllowlistError(
        `relations.${name} needs kind table|view and wave 0-9`
      );
    if (entry.retained !== undefined && !base)
      throw new AllowlistError(
        `relations.${name}.retained is not accepted; record schema the types declare ahead of its migration under typesAhead`
      );
  });
  requireNames(
    value.defaultAclExemptOwners,
    'defaultAclExemptOwners',
    (name, entry) => {
      if (typeof entry.reason !== 'string' || !entry.reason.trim())
        throw new AllowlistError(
          `defaultAclExemptOwners.${name} needs a reason`
        );
    }
  );
  // Fields added after the guard landed: a base without them is read as
  // empty, and the change that introduces a field may populate it.
  value[INTRODUCED] = new Set();
  for (const label of LATER_FIELDS) {
    if (value[label] === undefined) {
      value[label] = {};
      value[INTRODUCED].add(label);
    }
  }
  requireReasons(
    value.platformObjects,
    'platformObjects',
    /^(?:relation:[a-z_][a-z0-9_]*|function:[a-z_][a-z0-9_]*\([^()]*\))$/u
  );
  requireReasons(value.clientViewExceptions, 'clientViewExceptions', NAME);
  requireNames(value.typesAhead, 'typesAhead', (name, entry) => {
    for (const field of ['owner', 'reason', 'evidence'])
      if (typeof entry[field] !== 'string' || !entry[field].trim())
        throw new AllowlistError(`typesAhead.${name} needs ${field}`);
    if (!isWave(entry.wave))
      throw new AllowlistError(`typesAhead.${name} needs wave 0-9`);
    if (Object.hasOwn(value.relations, name))
      throw new AllowlistError(
        `typesAhead.${name} is also allowlisted in relations`
      );
  });
  requireNames(value.moved, 'moved', (name, entry) => {
    if (!isWave(entry.wave) || entry.schema !== 'private')
      throw new AllowlistError(
        `moved.${name} needs wave 0-9 and schema "private"`
      );
    if (Object.hasOwn(value.relations, name))
      throw new AllowlistError(
        `moved.${name} is also allowlisted in relations`
      );
  });
  requireNames(
    value.serviceRoleCompatViews,
    'serviceRoleCompatViews',
    (name, entry) => {
      if (!isWave(entry.expiresAfterWave))
        throw new AllowlistError(
          `serviceRoleCompatViews.${name} needs expiresAfterWave 0-9`
        );
      if (
        typeof entry.target !== 'string' ||
        !/^private\.[a-z_][a-z0-9_]*$/u.test(entry.target)
      )
        throw new AllowlistError(
          `serviceRoleCompatViews.${name} needs target private.<name>`
        );
      if (Object.hasOwn(value.relations, name))
        throw new AllowlistError(
          `serviceRoleCompatViews.${name} is also allowlisted in relations`
        );
    }
  );
  const functions = requireObject(value.functions, 'functions');
  if (typeof functions.enforced !== 'boolean')
    throw new AllowlistError('functions.enforced must be boolean');
  requireNames(functions.names, 'functions.names', (name, entry) => {
    if (typeof entry.reason !== 'string' || !entry.reason.trim())
      throw new AllowlistError(`functions.names.${name} needs a reason`);
  });
  return value;
}

/**
 * Compare the current allowlist with the merge-base allowlist. Returns
 * violation strings; an empty array means the change only shrinks.
 */
function compareWithBase(current, base) {
  const violations = [];
  for (const name of Object.keys(current.relations))
    if (!Object.hasOwn(base.relations, name))
      violations.push(
        `relations.${name} was added; create the relation in private instead`
      );
  for (const name of Object.keys(current.functions.names))
    if (!Object.hasOwn(base.functions.names, name))
      violations.push(
        `functions.names.${name} was added; allowlist additions need security review in a dedicated change`
      );
  for (const name of Object.keys(current.defaultAclExemptOwners))
    if (!Object.hasOwn(base.defaultAclExemptOwners, name))
      violations.push(
        `defaultAclExemptOwners.${name} was added; exemptions need security review in a dedicated change`
      );
  for (const label of ['platformObjects', 'clientViewExceptions']) {
    if (base[INTRODUCED]?.has(label)) continue;
    for (const key of Object.keys(current[label]))
      if (!Object.hasOwn(base[label], key))
        violations.push(
          `${label}.${key} was added; exceptions need security review in a dedicated change`
        );
  }
  // A typesAhead entry may only narrow an allowlisted relation; it never
  // grants a new name.
  for (const name of Object.keys(current.typesAhead))
    if (
      !Object.hasOwn(base.typesAhead, name) &&
      !Object.hasOwn(base.relations, name)
    )
      violations.push(
        `typesAhead.${name} was added; only an allowlisted relation can move to typesAhead`
      );
  for (const name of Object.keys(base.moved))
    if (!Object.hasOwn(current.moved, name))
      violations.push(
        `moved.${name} was removed; moved relations stay recorded`
      );
  for (const name of Object.keys(base.relations))
    if (
      !Object.hasOwn(current.relations, name) &&
      !Object.hasOwn(current.moved, name) &&
      !Object.hasOwn(current.typesAhead, name)
    )
      violations.push(
        `relations.${name} was removed without a moved.${name} or typesAhead.${name} record`
      );
  if (current.currentWave < base.currentWave)
    violations.push('currentWave decreased');
  if (base.functions.enforced && !current.functions.enforced)
    violations.push('functions.enforced was turned off');
  if (current.lintAfterVersion > base.lintAfterVersion)
    violations.push(
      'lintAfterVersion moved later, which would skip linting migrations'
    );
  return violations;
}

/** Compat views must expire; an expired view is a violation. */
function expiredCompatViews(allowlist) {
  return Object.entries(allowlist.serviceRoleCompatViews)
    .filter(([, entry]) => entry.expiresAfterWave < allowlist.currentWave)
    .map(
      ([name, entry]) =>
        `serviceRoleCompatViews.${name} expired after wave ${entry.expiresAfterWave}; drop the view and the entry`
    );
}

module.exports = {
  ALLOWLIST_PATH,
  AllowlistError,
  compareWithBase,
  expiredCompatViews,
  parseAllowlist,
};
