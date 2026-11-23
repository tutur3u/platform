import {
  createExternalLinkReadToken,
  verifyExternalLinkReadToken,
} from '@tuturuuu/utils/app-coordination-token';
import {
  EXTERNAL_LINK_ID_SCOPE_PREFIX,
  isUpskiiClassId,
  isUpskiiReadScope,
  UPSKII_APP_ID,
  UPSKII_CLASS_SCOPE_PREFIX,
  UPSKII_READ_TOKEN_TTL_SECONDS,
  type UpskiiReadScope,
} from './constants';
import type {
  ExternalAccountLinkRow,
  ExternalAccountLinkStore,
} from './link-store';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function isLinkId(value: string) {
  return UUID_PATTERN.test(value);
}

export type UpskiiLinkSummary = {
  linkedAt: string;
  linkId: string;
  scopes: string[];
  upskiiEmail: string | null;
};

export type LinkUpskiiResult =
  | { created: boolean; link: ExternalAccountLinkRow; ok: true }
  | { code: 'LINK_CONFLICT'; ok: false; side: 'tuturuuu' | 'upskii' }
  | { code: 'LINK_BEARER_USED'; ok: false };

export function summarizeLink(link: ExternalAccountLinkRow): UpskiiLinkSummary {
  return {
    linkedAt: link.linked_at,
    linkId: link.id,
    scopes: link.scopes,
    upskiiEmail: link.external_email,
  };
}

export function auditLinkEvent(
  event: string,
  fields: {
    linkId?: string;
    reason?: string;
    side?: string;
    userId?: string;
  }
) {
  // Ids only: emails and tokens never reach logs.
  const log = fields.reason ? console.warn : console.info;
  log('[upskii-link]', { event, provider: UPSKII_APP_ID, ...fields });
}

/**
 * Creates the one active link between a Tuturuuu user and an Upskii account,
 * or refreshes it when the same pair links again. Each link-only bearer
 * writes once: its jti is recorded on the row, and a later request with the
 * same bearer is refused.
 */
export async function linkUpskiiAccount(
  store: ExternalAccountLinkStore,
  input: {
    /** jti of the link-only bearer making the request. */
    bearerJti: string;
    scopes: UpskiiReadScope[];
    upskiiEmail: string | null;
    upskiiUserId: string;
    userId: string;
  }
): Promise<LinkUpskiiResult> {
  const scopes = [...new Set(input.scopes)].sort();
  if (await store.hasLinkJti(input.bearerJti)) {
    return { code: 'LINK_BEARER_USED', ok: false };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const [byUser, bySubject] = await Promise.all([
      store.findActiveByUser(input.userId),
      store.findActiveBySubject(input.upskiiUserId),
    ]);

    if (byUser && byUser.external_subject !== input.upskiiUserId) {
      return { code: 'LINK_CONFLICT', ok: false, side: 'tuturuuu' };
    }
    if (bySubject && bySubject.user_id !== input.userId) {
      return { code: 'LINK_CONFLICT', ok: false, side: 'upskii' };
    }
    if (byUser) {
      const link = await store.updateActive(byUser.id, {
        external_email: input.upskiiEmail,
        link_jti: input.bearerJti,
        scopes,
      });
      if (!link) return { code: 'LINK_BEARER_USED', ok: false };
      return { created: false, link, ok: true };
    }

    const link = await store.insert({
      external_email: input.upskiiEmail,
      external_subject: input.upskiiUserId,
      link_jti: input.bearerJti,
      scopes,
      user_id: input.userId,
    });
    if (link) return { created: true, link, ok: true };
    // A concurrent link took a unique slot; re-read to classify it.
  }

  throw new Error('external_account_links: link did not settle');
}

export async function revokeUpskiiLinkForUser(
  store: ExternalAccountLinkStore,
  userId: string
) {
  const link = await store.findActiveByUser(userId);
  if (!link) return null;
  return (await store.revoke(link.id, 'user')) ? link : null;
}

/** Upskii-initiated unlink. The link must belong to the named Upskii user. */
export async function revokeUpskiiLinkFromProvider(
  store: ExternalAccountLinkStore,
  { linkId, upskiiUserId }: { linkId: string; upskiiUserId: string }
): Promise<'not_found' | 'revoked'> {
  if (!isLinkId(linkId)) return 'not_found';
  const link = await store.findById(linkId);
  if (!link || link.external_subject !== upskiiUserId) return 'not_found';
  if (link.revoked_at) return 'revoked';
  await store.revoke(link.id, 'provider');
  return 'revoked';
}

/**
 * Upskii's check of its own row: active only while Tuturuuu holds the same
 * link for the same Upskii user.
 */
export async function getUpskiiLinkStatusForProvider(
  store: ExternalAccountLinkStore,
  { linkId, upskiiUserId }: { linkId: string; upskiiUserId: string }
): Promise<{ active: boolean }> {
  if (!isLinkId(linkId)) return { active: false };
  const link = await store.findById(linkId);
  return {
    active: Boolean(
      link && !link.revoked_at && link.external_subject === upskiiUserId
    ),
  };
}

/** Mints the 60-second, single-scope token for one read through a link. */
export function createUpskiiReadToken(
  link: ExternalAccountLinkRow,
  scope: UpskiiReadScope,
  options: { classId?: string | null; now?: Date; secret?: string } = {}
) {
  if (link.revoked_at || !link.scopes.includes(scope)) {
    throw new Error('Link does not grant this scope');
  }
  const { classId, ...tokenOptions } = options;
  if (classId && !isUpskiiClassId(classId)) {
    throw new Error('Invalid class id');
  }
  return createExternalLinkReadToken(
    {
      expiresInSeconds: UPSKII_READ_TOKEN_TTL_SECONDS,
      scopes: [
        scope,
        `${EXTERNAL_LINK_ID_SCOPE_PREFIX}${link.id}`,
        ...(classId ? [`${UPSKII_CLASS_SCOPE_PREFIX}${classId}`] : []),
      ],
      targetApp: UPSKII_APP_ID,
      userId: link.user_id,
    },
    tokenOptions
  );
}

export type UpskiiIntrospection =
  | {
      active: true;
      /** The one class the token was minted for, when it names one. */
      classId?: string;
      linkId: string;
      scopes: UpskiiReadScope[];
      tuturuuuUserId: string;
      upskiiUserId: string;
    }
  | {
      active: false;
      /**
       * Set only for a validly signed token whose link was revoked, so
       * Upskii can delete exactly its matching row.
       */
      revoked?: { linkId: string; upskiiUserId: string };
    };

/**
 * Answers Upskii's check of a read token: active only when the token is a
 * valid link read token for Upskii and its link is still active, belongs to
 * the token's user and still grants every scope the token carries.
 */
export async function introspectUpskiiReadToken(
  store: ExternalAccountLinkStore,
  token: string,
  options: { now?: Date; secret?: string } = {}
): Promise<UpskiiIntrospection> {
  const verified = verifyExternalLinkReadToken(token, options);
  if (!verified.ok || verified.claims.target_app !== UPSKII_APP_ID) {
    return { active: false };
  }

  const { scopes: tokenScopes, sub } = verified.claims;
  const linkScopes = tokenScopes.filter((scope) =>
    scope.startsWith(EXTERNAL_LINK_ID_SCOPE_PREFIX)
  );
  const classScopes = tokenScopes.filter((scope) =>
    scope.startsWith(UPSKII_CLASS_SCOPE_PREFIX)
  );
  const readScopes = tokenScopes.filter(isUpskiiReadScope);
  const classId = classScopes[0]?.slice(UPSKII_CLASS_SCOPE_PREFIX.length);
  if (
    linkScopes.length !== 1 ||
    classScopes.length > 1 ||
    (classId !== undefined && !isUpskiiClassId(classId)) ||
    readScopes.length === 0 ||
    readScopes.length + linkScopes.length + classScopes.length !==
      tokenScopes.length
  ) {
    return { active: false };
  }

  const linkId = linkScopes[0]!.slice(EXTERNAL_LINK_ID_SCOPE_PREFIX.length);
  if (!isLinkId(linkId)) return { active: false };
  const link = await store.findById(linkId);
  if (link?.revoked_at && link.user_id === sub) {
    return {
      active: false,
      revoked: { linkId: link.id, upskiiUserId: link.external_subject },
    };
  }
  if (
    !link ||
    link.user_id !== sub ||
    !readScopes.every((scope) => link.scopes.includes(scope))
  ) {
    return { active: false };
  }

  return {
    active: true,
    ...(classId ? { classId } : {}),
    linkId: link.id,
    scopes: readScopes,
    tuturuuuUserId: link.user_id,
    upskiiUserId: link.external_subject,
  };
}
