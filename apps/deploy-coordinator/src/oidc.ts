import {
  allowedWorkflows,
  type EnvironmentName,
  type ProjectEntry,
  requiredRef,
} from './projects';

export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
export const GITHUB_JWKS_URL = `${GITHUB_ISSUER}/.well-known/jwks`;

// Pull request events never authorize a deployment, whatever the ref.
const ALLOWED_EVENTS = new Set(['push', 'workflow_dispatch', 'schedule']);
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_LENGTH = 8_192;

export type GithubClaims = {
  repository: string;
  repository_id: string;
  ref: string;
  sha: string;
  run_id: string;
  run_attempt: string;
  event_name: string;
  job_workflow_ref: string;
  // The workflow the run started from; differs from job_workflow_ref when
  // the job runs inside a reusable workflow.
  workflow_ref: string;
  actor: string;
};

export type OidcFailure =
  | 'MALFORMED'
  | 'UNSUPPORTED_ALG'
  | 'UNKNOWN_KEY'
  | 'BAD_SIGNATURE'
  | 'BAD_ISSUER'
  | 'BAD_AUDIENCE'
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'BAD_REPOSITORY'
  | 'BAD_EVENT'
  | 'BAD_WORKFLOW'
  | 'BAD_REF';

export type OidcResult =
  | { ok: true; claims: GithubClaims }
  | { ok: false; reason: OidcFailure };

export type KeySource = (kid: string) => Promise<JsonWebKey | null>;

type FetchJson = (url: string) => Promise<unknown>;

// Per-isolate JWKS cache. An unknown key id triggers at most one refetch a
// minute, so forged tokens cannot amplify outbound requests.
export function githubKeySource(
  fetchJson: FetchJson,
  now: () => number = Date.now
): KeySource {
  let keys = new Map<string, JsonWebKey>();
  let fetchedAt = Number.NEGATIVE_INFINITY;
  const refresh = async () => {
    fetchedAt = now();
    let body: { keys?: Array<JsonWebKey & { kid?: string }> };
    try {
      body = (await fetchJson(GITHUB_JWKS_URL)) as typeof body;
    } catch (caught) {
      // Keep the cached keys; the next refetch waits for the minute to pass.
      console.warn('GitHub JWKS refresh failed', caught);
      return;
    }
    keys = new Map(
      (body?.keys ?? [])
        .filter((key) => typeof key.kid === 'string' && key.kty === 'RSA')
        .map((key) => [key.kid as string, key])
    );
  };
  return async (kid) => {
    const stale = now() - fetchedAt > 10 * 60_000;
    if ((stale || !keys.has(kid)) && now() - fetchedAt > 60_000)
      await refresh();
    return keys.get(kid) ?? null;
  };
}

function decodeSegment(segment: string): unknown {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function signatureBytes(segment: string) {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 512;

export async function verifyGithubToken(
  token: string,
  options: {
    audience: string;
    repositoryId: string;
    keys: KeySource;
    nowSeconds: number;
  }
): Promise<OidcResult> {
  const parts = token.length <= MAX_TOKEN_LENGTH ? token.split('.') : [];
  if (parts.length !== 3) return { ok: false, reason: 'MALFORMED' };
  const [headerPart, payloadPart, signaturePart] = parts as [
    string,
    string,
    string,
  ];
  let header: { alg?: unknown; kid?: unknown };
  let payload: Record<string, unknown>;
  try {
    header = decodeSegment(headerPart) as typeof header;
    payload = decodeSegment(payloadPart) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (!payload || typeof payload !== 'object')
    return { ok: false, reason: 'MALFORMED' };
  if (header?.alg !== 'RS256') return { ok: false, reason: 'UNSUPPORTED_ALG' };
  if (!isString(header.kid)) return { ok: false, reason: 'UNKNOWN_KEY' };
  const jwk = await options.keys(header.kid);
  if (!jwk) return { ok: false, reason: 'UNKNOWN_KEY' };
  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signatureBytes(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`)
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'BAD_SIGNATURE' };

  if (payload.iss !== GITHUB_ISSUER) return { ok: false, reason: 'BAD_ISSUER' };
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(options.audience))
    return { ok: false, reason: 'BAD_AUDIENCE' };
  const now = options.nowSeconds;
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < now)
    return { ok: false, reason: 'EXPIRED' };
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > now)
    return { ok: false, reason: 'NOT_YET_VALID' };
  if (String(payload.repository_id) !== options.repositoryId)
    return { ok: false, reason: 'BAD_REPOSITORY' };
  const claims = {
    repository: payload.repository,
    repository_id: String(payload.repository_id),
    ref: payload.ref,
    sha: payload.sha,
    run_id: String(payload.run_id ?? ''),
    run_attempt: String(payload.run_attempt ?? ''),
    event_name: payload.event_name,
    job_workflow_ref: payload.job_workflow_ref,
    workflow_ref: payload.workflow_ref,
    actor: payload.actor,
  };
  if (
    !isString(claims.repository) ||
    !isString(claims.ref) ||
    !isString(claims.sha) ||
    !/^[1-9]\d{0,18}$/.test(claims.run_id) ||
    !/^[1-9]\d{0,4}$/.test(claims.run_attempt) ||
    !isString(claims.job_workflow_ref) ||
    !isString(claims.workflow_ref) ||
    !isString(claims.actor) ||
    !isString(claims.event_name)
  )
    return { ok: false, reason: 'MALFORMED' };
  if (!ALLOWED_EVENTS.has(claims.event_name))
    return { ok: false, reason: 'BAD_EVENT' };
  return { ok: true, claims: claims as GithubClaims };
}

// Binds a verified token to one catalog project environment: the reporting
// job must run the project's allowlisted workflow file at the environment's
// protected ref.
export function authorizeForEnvironment(
  claims: GithubClaims,
  project: ProjectEntry,
  environment: EnvironmentName
): OidcFailure | null {
  const ref = requiredRef(environment);
  if (claims.ref !== ref) return 'BAD_REF';
  const at = (file: string) =>
    `${claims.repository}/.github/workflows/${file}@${ref}`;
  const allowed = allowedWorkflows(project, environment).some((rule) =>
    typeof rule === 'string'
      ? claims.job_workflow_ref === at(rule)
      : claims.job_workflow_ref === at(rule.reusable) &&
        claims.workflow_ref === at(rule.caller)
  );
  if (!allowed) return 'BAD_WORKFLOW';
  return null;
}
