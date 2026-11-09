export const DEFAULT_FEATURE_EMAIL_DOMAINS = Object.freeze(['tuturuuu.com']);
export const FEATURE_ROLLOUT_STAGES = Object.freeze([
  'internal',
  'rollout',
  'ga',
]);
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

export function validateFeatureRollout(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return ['rollout must be an object'];
  const errors = [];
  if (!FEATURE_ROLLOUT_STAGES.includes(value.stage))
    errors.push('stage is invalid');
  if (typeof value.owner !== 'string' || !value.owner.trim())
    errors.push('owner is required');
  if (
    typeof value.removeBy !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.removeBy) ||
    !Number.isFinite(Date.parse(value.removeBy)) ||
    new Date(value.removeBy).toISOString().slice(0, 10) !== value.removeBy
  )
    errors.push('removeBy must be a calendar date');
  if (
    value.stage === 'internal' &&
    value.emailDomainAllowlist !== undefined &&
    (!Array.isArray(value.emailDomainAllowlist) ||
      !value.emailDomainAllowlist.every(
        (domain) => typeof domain === 'string' && DOMAIN.test(domain)
      ))
  )
    errors.push('emailDomainAllowlist must contain exact domains');
  if (value.stage === 'rollout') {
    const audience = value.audience;
    if (!audience || typeof audience !== 'object')
      errors.push('rollout audience is required');
    else if (audience.kind === 'percentage') {
      if (
        !Number.isInteger(audience.percentage) ||
        audience.percentage < 0 ||
        audience.percentage > 100
      )
        errors.push('percentage must be an integer from 0 to 100');
    } else if (audience.kind === 'workspaces') {
      if (
        !Array.isArray(audience.workspaceIds) ||
        !audience.workspaceIds.every(
          (id) => typeof id === 'string' && id.trim() === id && id.length > 0
        )
      )
        errors.push('workspaceIds must contain non-empty ids');
    } else errors.push('rollout audience kind is invalid');
  }
  return errors;
}

function authenticated(user) {
  return Boolean(
    user &&
    typeof user.id === 'string' &&
    user.id.length > 0 &&
    user.is_anonymous !== true
  );
}

export function isInternalFeatureAudience(
  user,
  domains = DEFAULT_FEATURE_EMAIL_DOMAINS
) {
  if (
    !authenticated(user) ||
    typeof user.email !== 'string' ||
    typeof user.email_confirmed_at !== 'string' ||
    !user.email_confirmed_at ||
    !Number.isFinite(Date.parse(user.email_confirmed_at))
  )
    return false;
  const match = /^[^@\s]+@([^@\s]+)$/.exec(user.email);
  return Boolean(
    match &&
    domains.some(
      (domain) =>
        typeof domain === 'string' &&
        DOMAIN.test(domain) &&
        match[1].toLowerCase() === domain.toLowerCase()
    )
  );
}

function bucket(key, userId, workspaceId) {
  let hash = 2166136261;
  for (const character of JSON.stringify([key, userId, workspaceId])) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 10000;
}

/** Identity and permissions come from the server's verified request boundary. */
export function isFeatureEnabled(key, context, configuration) {
  if (
    !authenticated(context.user) ||
    context.permissionGranted !== true ||
    !Object.hasOwn(configuration.enabledFlags, key) ||
    configuration.enabledFlags[key] !== true ||
    !Object.hasOwn(configuration.rollouts, key)
  )
    return false;
  const policy = configuration.rollouts[key];
  if (validateFeatureRollout(policy).length > 0) return false;
  switch (policy.stage) {
    case 'internal':
      return isInternalFeatureAudience(
        context.user,
        policy.emailDomainAllowlist
      );
    case 'rollout':
      if (!authenticated(context.user)) return false;
      return policy.audience.kind === 'workspaces'
        ? typeof context.workspace?.id === 'string' &&
            policy.audience.workspaceIds.includes(context.workspace.id)
        : bucket(key, context.user.id, context.workspace?.id ?? '') <
            policy.audience.percentage * 100;
    case 'ga':
      return true;
    default:
      return false;
  }
}
