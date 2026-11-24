import {
  createRemoteJWKSet,
  errors,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from 'jose';

/**
 * GitHub Actions OIDC principal for the Upskii production E2E workflow. Every
 * value a token must carry is pinned here, never read from the environment, so
 * a configuration change cannot widen who may operate QA accounts.
 */
export const QA_CI_OPERATOR_HEADER = 'x-tuturuuu-qa-operator';
export const QA_CI_OPERATOR_KIND = 'github-oidc';
export const QA_CI_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
export const QA_CI_OIDC_AUDIENCE = 'https://tuturuuu.com/qa-operator';
export const QA_CI_REPOSITORY = 'tutur3u/platform';
// Numeric IDs survive renames: a repository later created under the old name
// carries a different ID.
export const QA_CI_REPOSITORY_ID = '536896722';
export const QA_CI_REPOSITORY_OWNER_ID = '107694301';
export const QA_CI_REF = 'refs/heads/main';
export const QA_CI_JOB_WORKFLOW_REF =
  'tutur3u/platform/.github/workflows/upskii-production-e2e.yaml@refs/heads/main';
export const QA_CI_ENVIRONMENT = 'upskii-production-e2e';
export const QA_CI_EVENTS: ReadonlySet<string> = new Set([
  'workflow_dispatch',
  'workflow_run',
  'repository_dispatch',
  'schedule',
]);
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_AGE = '1h';

let githubKeys: JWTVerifyGetKey | undefined;
function defaultKeys() {
  // jose caches the key set per instance, refetches at most every 30 seconds
  // for an unknown key ID, and aborts a fetch after 3 seconds.
  githubKeys ??= createRemoteJWKSet(
    new URL(`${QA_CI_OIDC_ISSUER}/.well-known/jwks`),
    {
      cacheMaxAge: 10 * 60_000,
      cooldownDuration: 30_000,
      timeoutDuration: 3000,
    }
  );
  return githubKeys;
}

/** Claims safe to log and audit. The token itself is never kept. */
export interface QaCiClaims {
  repository: string;
  runId: string;
  runAttempt: string;
  sha: string | null;
  eventName: string;
  actor: string | null;
}

export type QaCiVerification =
  | { ok: true; claims: QaCiClaims }
  | { ok: false; status: 401 | 403; reason: string };

const stringClaim = (payload: JWTPayload, key: string) =>
  typeof payload[key] === 'string' ? (payload[key] as string) : null;

const PINNED_CLAIMS: ReadonlyArray<[string, string]> = [
  ['repository', QA_CI_REPOSITORY],
  ['repository_id', QA_CI_REPOSITORY_ID],
  ['repository_owner_id', QA_CI_REPOSITORY_OWNER_ID],
  ['ref', QA_CI_REF],
  ['job_workflow_ref', QA_CI_JOB_WORKFLOW_REF],
  ['environment', QA_CI_ENVIRONMENT],
];

/** Workflow claims, checked after the signature, issuer, audience and times. */
export function checkQaCiClaims(payload: JWTPayload): QaCiVerification {
  for (const [key, expected] of PINNED_CLAIMS) {
    if (stringClaim(payload, key) !== expected)
      return { ok: false, status: 403, reason: `claim_${key}` };
  }
  const eventName = stringClaim(payload, 'event_name');
  if (!eventName || !QA_CI_EVENTS.has(eventName))
    return { ok: false, status: 403, reason: 'claim_event_name' };
  const runId = stringClaim(payload, 'run_id');
  const runAttempt = stringClaim(payload, 'run_attempt');
  if (!runId || !/^\d{1,20}$/u.test(runId) || !runAttempt)
    return { ok: false, status: 403, reason: 'claim_run_id' };
  return {
    ok: true,
    claims: {
      repository: QA_CI_REPOSITORY,
      runId,
      runAttempt: runAttempt.slice(0, 8),
      sha: stringClaim(payload, 'sha')?.slice(0, 64) ?? null,
      eventName,
      actor: stringClaim(payload, 'actor')?.slice(0, 64) ?? null,
    },
  };
}

function verificationFailure(error: unknown): string {
  if (error instanceof errors.JWTExpired) return 'expired';
  if (error instanceof errors.JWTClaimValidationFailed)
    return `claim_${error.claim}`.slice(0, 40);
  if (error instanceof errors.JWSSignatureVerificationFailed)
    return 'signature';
  if (error instanceof errors.JWKSNoMatchingKey) return 'unknown_key';
  if (error instanceof errors.JWKSTimeout) return 'jwks_timeout';
  return 'invalid_token';
}

/**
 * Verifies a GitHub Actions OIDC token against GitHub's published keys and the
 * pinned claims. RS256 only; `iat`, `nbf` and `exp` are required, with a
 * 60-second skew allowance.
 */
export async function verifyQaCiToken(
  token: string,
  { keys = defaultKeys(), now }: { keys?: JWTVerifyGetKey; now?: Date } = {}
): Promise<QaCiVerification> {
  if (!token || token.length > 8192)
    return { ok: false, status: 401, reason: 'missing_token' };
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      audience: QA_CI_OIDC_AUDIENCE,
      clockTolerance: CLOCK_SKEW_SECONDS,
      currentDate: now,
      issuer: QA_CI_OIDC_ISSUER,
      maxTokenAge: MAX_TOKEN_AGE,
      requiredClaims: ['iat', 'nbf', 'exp'],
    });
    // GitHub always sends a single audience; refuse a token minted for several.
    if (Array.isArray(payload.aud) && payload.aud.length !== 1)
      return { ok: false, status: 401, reason: 'claim_aud' };
    return checkQaCiClaims(payload);
  } catch (error) {
    return { ok: false, status: 401, reason: verificationFailure(error) };
  }
}
