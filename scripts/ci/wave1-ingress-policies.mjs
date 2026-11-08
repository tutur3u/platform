// Access policy rules for ingress-admitted staging hosts (design §6.1,
// Tess C1/C2 and the service-token-only bootstrap ruling R-a/R-b).
//
// `bootstrap`: the first pair is published and read back with ZERO allow
// policies; only service-auth policies naming exactly the configured CI
// health service token(s), and nothing else. `staff`: the C1 staff selector
// rules apply. The phase is a repository variable read fresh by the caller;
// a missing or unknown phase refuses. Nothing here, or in the publisher,
// ever changes the phase.

/** The company identity domain for staff email_domain selectors (D-4). */
export const STAFF_EMAIL_DOMAIN = 'tuturuuu.com';
export const ACCESS_PHASES = ['bootstrap', 'staff'];

/**
 * An Access include rule that names only staff (C1): the configured staff
 * group or email list, an explicit email, or the company email domain.
 * Every other selector type, including unknown ones, is refused.
 */
export function staffSelector(rule, { groupId, emailListId } = {}) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false;
  const keys = Object.keys(rule);
  if (keys.length !== 1) return false;
  const [type] = keys;
  const value = rule[type];
  if (!value || typeof value !== 'object') return false;
  switch (type) {
    case 'group':
      return Boolean(groupId) && value.id === groupId;
    case 'email': {
      const email = String(value.email ?? '').toLowerCase();
      return (
        /^[^\s@]+@[^\s@]+$/u.test(email) &&
        email.endsWith(`@${STAFF_EMAIL_DOMAIN}`)
      );
    }
    case 'email_list':
      // Pinned like the group: only the configured staff list counts.
      return Boolean(emailListId) && value.id === emailListId;
    case 'email_domain':
      return String(value.domain ?? '').toLowerCase() === STAFF_EMAIL_DOMAIN;
    default:
      return false;
  }
}

/** Parses `STAGING_ACCESS_HEALTH_TOKEN_IDS`: comma-separated service-token ids. */
export function healthTokenIds(value) {
  const ids = String(value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length && ids.every((id) => /^[a-f0-9-]{36}$/u.test(id))
    ? [...new Set(ids)].sort()
    : null;
}

const serviceTokenId = (rule) =>
  rule &&
  typeof rule === 'object' &&
  Object.keys(rule).length === 1 &&
  'service_token' in rule
    ? String(rule.service_token?.token_id ?? '')
    : null;

export function evaluatePolicies(
  policies,
  { phase, staffGroupId, staffEmailListId, healthTokens } = {}
) {
  const failures = [];
  if (!ACCESS_PHASES.includes(phase))
    return [
      `Access: phase must be bootstrap or staff (got ${phase ?? 'missing'})`,
    ];
  const named = new Set();
  for (const policy of policies) {
    const includes = policy.include ?? [];
    const name = policy.name ?? policy.id;
    if (includes.some((rule) => rule && 'everyone' in rule))
      failures.push(`Access: policy ${name} includes everyone`);
    if (!['allow', 'non_identity', 'bypass', 'deny'].includes(policy.decision))
      failures.push(`Access: unknown policy decision ${policy.decision}`);
    // C2: the host-wide app never carries a bypass, in either phase.
    if (policy.decision === 'bypass')
      failures.push(
        `Access: bypass policy ${name} on the host-wide application is forbidden`
      );
    // Service auth names at least one specific service token; an empty
    // include would otherwise pass `.every()`.
    if (policy.decision === 'non_identity') {
      const ids = includes.map(serviceTokenId);
      if (!includes.length || ids.some((id) => !id))
        failures.push(
          `Access: service-auth policy ${name} must name service tokens`
        );
      for (const id of ids) if (id) named.add(id);
    }
    if (phase === 'bootstrap' && policy.decision !== 'non_identity')
      failures.push(
        `Access: bootstrap allows only CI health service-auth policies (${name} is ${policy.decision})`
      );
    // C1: in staff, allow includes name only the configured staff selector.
    if (phase === 'staff' && policy.decision === 'allow') {
      if (!includes.length)
        failures.push(`Access: allow policy ${name} has no staff selector`);
      for (const rule of includes)
        if (
          !staffSelector(rule, {
            groupId: staffGroupId,
            emailListId: staffEmailListId,
          })
        )
          failures.push(
            `Access: allow policy ${name} includes a non-staff selector (${Object.keys(rule ?? {}).join(',') || 'empty'}); staff emails must use @${STAFF_EMAIL_DOMAIN} exactly`
          );
    }
  }
  if (phase === 'staff' && !policies.some((p) => p.decision === 'allow'))
    failures.push('Access: no staff allow policy');
  if (phase === 'bootstrap') {
    // R-b: exactly the configured CI health token(s), no more and no fewer.
    const expected = healthTokens ?? [];
    if (!expected.length)
      failures.push('Access: bootstrap needs STAGING_ACCESS_HEALTH_TOKEN_IDS');
    const actual = [...named].sort();
    if (expected.length && JSON.stringify(actual) !== JSON.stringify(expected))
      failures.push(
        'Access: bootstrap service tokens must be exactly the CI health token(s)'
      );
  }
  return failures;
}
