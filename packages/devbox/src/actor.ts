/** Framework-free, request-local credential policy. Never cache its verdict. */
export type DevboxScope = 'devbox:read' | 'devbox:run' | 'devbox:build';
export type DevboxGrant = {
  id: string;
  user_id: string;
  status: 'pending' | 'active' | 'suspended' | 'revoked' | 'expired';
  suspended: boolean;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  sessions_not_before: string;
  require_mfa: boolean;
};
export type DevboxIdentity = {
  enabled: boolean;
  grant: DevboxGrant | null;
  token: {
    id: string;
    user_id: string;
    grant_id: string;
    scopes: DevboxScope[];
  } | null;
};
export type DevboxActor =
  | { kind: 'fleet'; userId: string }
  | {
      kind: 'personal';
      userId: string;
      tokenId: string | null;
      scopes: DevboxScope[];
    };
export type DevboxActorVerdict =
  | { ok: true; actor: DevboxActor }
  | { ok: false; status: number; code: string };
export type DevboxCredential =
  | { kind: 'agent'; identity: DevboxIdentity | null }
  | {
      kind: 'session';
      userId: string;
      issuedAt: number | null;
      cli: boolean;
      identity: DevboxIdentity | null;
    };
export type DevboxOperation =
  | DevboxScope
  | 'mutate'
  | 'fleet'
  | 'accept'
  | 'tokens';
const deny = (status: number, code: string): DevboxActorVerdict => ({
  ok: false,
  status,
  code,
});

export async function requireDevboxActor(input: {
  credential: DevboxCredential;
  operation: DevboxOperation;
  isRootMember: (userId: string) => Promise<boolean>;
  now?: number;
}): Promise<DevboxActorVerdict> {
  const { credential, operation } = input;
  const now = input.now ?? Date.now();
  const identity = credential.identity;
  // F4: this entire branch completes BEFORE any membership lookup. A valid
  // tdba_ credential can only construct a personal actor, even for a root user.
  if (credential.kind === 'agent') {
    const token = identity?.token;
    const grant = identity?.grant;
    if (
      !token ||
      !grant ||
      token.user_id !== grant.user_id ||
      token.grant_id !== grant.id
    )
      return deny(401, 'DEVBOX_TOKEN_INVALID');
    if (
      operation === 'fleet' ||
      operation === 'accept' ||
      operation === 'tokens'
    )
      return deny(403, 'DEVBOX_TOKEN_SCOPE');
    if (
      operation === 'mutate'
        ? !token.scopes.some(
            (scope) => scope === 'devbox:run' || scope === 'devbox:build'
          )
        : !token.scopes.includes(operation)
    )
      return deny(403, 'DEVBOX_TOKEN_SCOPE');
    const refused = grantDenied(identity, now);
    if (refused) return refused;
    return {
      ok: true,
      actor: {
        kind: 'personal',
        userId: token.user_id,
        tokenId: token.id,
        scopes: token.scopes,
      },
    };
  }
  if (await input.isRootMember(credential.userId)) {
    if (operation === 'accept' || operation === 'tokens')
      return deny(403, 'DEVBOX_PERSONAL_GRANT_REQUIRED');
    return { ok: true, actor: { kind: 'fleet', userId: credential.userId } };
  }
  const grant = identity?.grant;
  if (!grant || grant.user_id !== credential.userId)
    return deny(403, 'DEVBOX_GRANT_REQUIRED');
  if (operation === 'accept') {
    if (
      grant.suspended ||
      grant.status !== 'pending' ||
      Date.parse(grant.expires_at) <= now
    )
      return deny(403, 'DEVBOX_GRANT_NOT_PENDING');
  } else {
    const refused = grantDenied(identity, now);
    if (refused) return refused;
    if (
      credential.issuedAt === null ||
      credential.issuedAt <
        Math.max(
          Date.parse(grant.sessions_not_before),
          Date.parse(grant.accepted_at ?? '')
        )
    )
      return deny(403, 'DEVBOX_SESSION_CUTOFF');
    if (operation !== 'tokens' && operation !== 'devbox:read')
      return deny(403, 'DEVBOX_ACCESS_TOKEN_REQUIRED');
  }
  return {
    ok: true,
    actor: {
      kind: 'personal',
      userId: credential.userId,
      tokenId: null,
      scopes: [],
    },
  };
}

function grantDenied(
  identity: DevboxIdentity | null,
  now: number
): DevboxActorVerdict | null {
  const grant = identity?.grant;
  if (!grant) return deny(403, 'DEVBOX_GRANT_REQUIRED');
  if (grant.suspended) return deny(403, 'DEVBOX_GRANT_SUSPENDED');
  if (grant.revoked_at !== null) return deny(403, 'DEVBOX_GRANT_REVOKED');
  if (grant.status !== 'active')
    return deny(403, `DEVBOX_GRANT_${grant.status.toUpperCase()}`);
  if (
    !grant.accepted_at ||
    Date.parse(grant.accepted_at) > now ||
    Date.parse(grant.expires_at) <= now
  )
    return deny(403, 'DEVBOX_GRANT_EXPIRED');
  if (!identity.enabled) return deny(403, 'DEVBOX_GRANT_DISABLED');
  return null;
}

/** Nullable expiry preserves existing fleet tokens; absent/malformed data fails closed. */
export function devboxRunnerTokenUnexpired(
  value: unknown,
  now = Date.now()
): boolean {
  return (
    value === null ||
    (typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      Date.parse(value) > now)
  );
}

/** Parse the runner's database boundary without trusting runner-supplied identity. */
export function devboxPersonalRunnerAuthorized(
  value: unknown,
  userId: string,
  expiry: unknown,
  now = Date.now()
): boolean {
  if (
    typeof expiry !== 'string' ||
    !devboxRunnerTokenUnexpired(expiry, now) ||
    !value ||
    typeof value !== 'object' ||
    !('enabled' in value) ||
    value.enabled !== true ||
    !('grant' in value)
  )
    return false;
  const grant = value.grant;
  if (
    !grant ||
    typeof grant !== 'object' ||
    !('user_id' in grant) ||
    grant.user_id !== userId ||
    !('status' in grant) ||
    grant.status !== 'active' ||
    !('suspended' in grant) ||
    grant.suspended !== false ||
    !('revoked_at' in grant) ||
    grant.revoked_at !== null ||
    !('accepted_at' in grant) ||
    typeof grant.accepted_at !== 'string' ||
    !Number.isFinite(Date.parse(grant.accepted_at)) ||
    !('expires_at' in grant) ||
    typeof grant.expires_at !== 'string'
  )
    return false;
  return (
    Date.parse(grant.expires_at) > now &&
    Date.parse(expiry) <= Date.parse(grant.expires_at)
  );
}

export function isDevboxEnvFilePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 500 &&
    !path.startsWith('/') &&
    !/^[a-z]:/i.test(path) &&
    !Array.from(path).some(
      (character) =>
        character === '\\' ||
        character.charCodeAt(0) < 32 ||
        character.charCodeAt(0) === 127
    ) &&
    path
      .split('/')
      .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

/** Fleet agents stop on credential loss; an untrusted guest still needs host stop. */
export async function devboxRunCancelRequested(
  response: Response
): Promise<boolean> {
  if (response.status === 401 || response.status === 403) return true;
  if (!response.ok) return false;
  const body: unknown = await response.json().catch(() => null);
  return Boolean(
    body &&
      typeof body === 'object' &&
      'cancelRequested' in body &&
      body.cancelRequested === true
  );
}
