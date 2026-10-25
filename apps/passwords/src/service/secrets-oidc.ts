import {
  PasswordsError,
  requireEnabled,
  text,
  uuid,
} from '@tuturuuu/storage-core/vault/passwords-contract';
import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from 'jose';
import { boundedJson, exactKeys } from './secrets-protocol';

export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
export const GITHUB_JWKS = `${GITHUB_ISSUER}/.well-known/jwks`;
export const OIDC_AUDIENCE = 'tuturuuu-passwords';
const matchFields = [
  'sub',
  'repository_id',
  'repository',
  'ref',
  'workflow_ref',
  'environment',
] as const;
export interface GitHubPolicy {
  sub: string;
  repository_id: string;
  repository: string;
  ref: string;
  workflow_ref: string;
  environment: string;
  grantId: string;
  issuerUserId: string;
  wsId: string;
  vaultId: string;
}

export function parsePolicies(source: string | undefined): GitHubPolicy[] {
  try {
    if (!source || source.length > 65536) throw new Error();
    const values: unknown = JSON.parse(source);
    if (!Array.isArray(values) || values.length < 1 || values.length > 32)
      throw new Error();
    const seen = new Set<string>();
    return values.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error();
      exactKeys(value, [
        ...matchFields,
        'grantId',
        'issuerUserId',
        'wsId',
        'vaultId',
      ]);
      for (const key of matchFields) {
        const field = text(value[key], 1024);
        if (
          !field ||
          field !== field.trim() ||
          Array.from(field).some(
            (character) =>
              character.charCodeAt(0) < 32 ||
              character.charCodeAt(0) === 127 ||
              character === '*' ||
              character === '?'
          )
        )
          throw new Error();
      }
      if (
        !/^[1-9][0-9]*$/.test(value.repository_id) ||
        !/^[^/]+\/[^/]+$/.test(value.repository) ||
        (!value.ref.startsWith('refs/heads/') && !value.ref.startsWith('refs/tags/')) ||
        value.sub.includes(':pull_request') ||
        !value.workflow_ref.startsWith(
          `${value.repository}/.github/workflows/`
        ) ||
        !value.workflow_ref.endsWith(`@${value.ref}`)
      )
        throw new Error();
      for (const key of ['grantId', 'issuerUserId', 'wsId', 'vaultId'])
        uuid(value[key]);
      const identity = JSON.stringify(matchFields.map((key) => value[key]));
      if (seen.has(identity)) throw new Error();
      seen.add(identity);
      return value as GitHubPolicy;
    });
  } catch {
    throw new PasswordsError('UNAVAILABLE');
  }
}

export async function verifyGitHubPolicy(
  token: string,
  policies: GitHubPolicy[],
  deps: {
    enabled(): boolean;
    signal: AbortSignal;
    fetch: typeof fetch;
    now(): number;
  }
): Promise<GitHubPolicy> {
  requireEnabled(deps.enabled);
  if (!token || token.length > 16384)
    throw new PasswordsError('UNAUTHENTICATED');
  const signal = AbortSignal.any([deps.signal, AbortSignal.timeout(5000)]);
  try {
    // A local resolver prevents unknown-kid refreshes from triggering a second network attempt.
    const response = await deps.fetch(GITHUB_JWKS, {
      signal,
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
    });
    requireEnabled(deps.enabled);
    if (
      !response.ok ||
      (response.url && response.url !== GITHUB_JWKS) ||
      response.headers.get('content-type')?.split(';')[0] !== 'application/json'
    )
      throw new Error();
    const jwks = await boundedJson(response.body, 65536, signal);
    if (!Array.isArray(jwks.keys) || !jwks.keys.length || jwks.keys.length > 16)
      throw new Error();
    const { payload } = await jwtVerify(
      token,
      createLocalJWKSet(jwks as unknown as JSONWebKeySet),
      {
        issuer: GITHUB_ISSUER,
        audience: OIDC_AUDIENCE,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'nbf', 'sub'],
        maxTokenAge: 600,
        currentDate: new Date(deps.now()),
        clockTolerance: 0,
      }
    );
    if (
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.exp - payload.iat > 600 ||
      payload.exp <= payload.iat ||
      payload.aud !== OIDC_AUDIENCE ||
      typeof payload.event_name !== 'string' ||
      !payload.event_name ||
      ['pull_request', 'pull_request_target'].includes(payload.event_name) ||
      (typeof payload.ref === 'string' && payload.ref.startsWith('refs/pull/'))
    )
      throw new Error();
    const matches = policies.filter((policy) =>
      matchFields.every((key) => payload[key] === policy[key])
    );
    if (matches.length !== 1) throw new Error();
    requireEnabled(deps.enabled);
    if (signal.aborted) throw new Error();
    return matches[0]!;
  } catch (error) {
    requireEnabled(deps.enabled);
    throw new PasswordsError(
      error instanceof PasswordsError && error.code === 'STOPPED'
        ? 'STOPPED'
        : 'UNAUTHENTICATED'
    );
  }
}
