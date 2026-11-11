import { authorizeIdentity, principalSchema, SsoError } from '@tuturuuu/sso';
import { createRequestClient } from '@tuturuuu/supabase/request/server';
import { bindCurrentMfaFactor } from '@tuturuuu/utils/required-mfa-lineage';
import {
  mfaProofFromVerifiedClaims,
  primaryProofTime,
  readRequiredMfaPolicy,
  requiresFreshPrimaryForMfa,
  satisfiesRequiredMfaPolicy,
} from '@tuturuuu/utils/required-mfa-policy';
import { checkRequiredAccountMfa } from '@tuturuuu/utils/required-mfa-request';
import type { BrowserState } from './browser-state';
import { hash, type SsoConfiguration } from './config';
import { boundedFetch, requireRpc, type SsoAdmin, snapshot } from './store';

/** Web cookie identity only; external SAML never receives an internal app token. */
async function cookieClient(request: Request) {
  // Ignore Authorization: browser consent is bound only to provider cookies.
  const cookieHeaders = new Headers(request.headers);
  cookieHeaders.delete('authorization');
  return createRequestClient(
    new Request(request.url, { headers: cookieHeaders }),
    { fetch: boundedFetch }
  );
}

export async function browserSession(request: Request) {
  const client = await cookieClient(request);
  const result = await client.auth.getUser();
  if (result.error) {
    if (result.error.name === 'AuthSessionMissingError') return null;
    throw new SsoError({ code: 'unavailable' });
  }
  if (!result.data.user) return null;
  const verified = await client.auth.getClaims();
  const claims = verified.data?.claims;
  if (
    verified.error ||
    claims?.sub !== result.data.user.id ||
    typeof claims.session_id !== 'string' ||
    !claims.session_id
  )
    throw new SsoError({ code: 'forbidden' });
  return { userId: result.data.user.id, sessionId: claims.session_id };
}

export async function bindSession(
  admin: SsoAdmin,
  state: BrowserState,
  actor: { userId: string; sessionId: string }
) {
  const result = await admin.rpc('sso_bind_transaction', {
    p_ws_id: state.policy.workspaceId,
    p_client_id: state.policy.clientId,
    p_transaction_id: state.id,
    p_actor_id: actor.userId,
    p_policy_revision: state.policy.revision,
    p_browser_binding_hash: state.browserHash,
    p_session_binding_hash: hash(`${actor.userId}:${actor.sessionId}`),
  });
  requireRpc(result);
  if (result.data === false) throw new SsoError({ code: 'session_changed' });
  if (result.data !== true) throw new SsoError({ code: 'unavailable' });
}

async function verifiedActor(request: Request, admin: SsoAdmin) {
  const client = await cookieClient(request);
  const authenticated = await client.auth.getUser();
  if (authenticated.error || !authenticated.data.user)
    throw new SsoError({ code: 'forbidden' });
  const userId = authenticated.data.user.id;
  const live = await admin.auth.admin.getUserById(userId);
  if (live.error || !live.data.user)
    throw new SsoError({ code: 'unavailable' });
  const user = live.data.user;
  if (user.id !== userId) throw new SsoError({ code: 'forbidden' });
  const now = Math.floor(Date.now() / 1000);
  const account = await checkRequiredAccountMfa(
    request,
    {
      createAdminClient: async () => admin,
      createUserClient: async () => client,
      nowSeconds: () => now,
    },
    { userId }
  );
  if (account.status !== 'allowed')
    throw new SsoError({
      code: account.status === 'required' ? 'mfa_required' : 'forbidden',
    });
  const verified = await client.auth.getClaims();
  const claims = verified.data?.claims;
  if (verified.error || !claims || claims.sub !== userId)
    throw new SsoError({ code: 'forbidden' });
  const proof = mfaProofFromVerifiedClaims(claims, now);
  const primaryAt = primaryProofTime(claims, now);
  if (
    !proof ||
    primaryAt === null ||
    requiresFreshPrimaryForMfa(user.app_metadata, claims) ||
    !satisfiesRequiredMfaPolicy(
      readRequiredMfaPolicy(user.app_metadata),
      proof,
      now
    )
  ) {
    throw new SsoError({ code: 'mfa_required' });
  }
  // Phase-1 assurance represents TOTP; other MFA methods need a qualified profile.
  if (
    !Array.isArray(claims.amr) ||
    !claims.amr.some(
      (a: unknown) =>
        a &&
        typeof a === 'object' &&
        'method' in a &&
        'timestamp' in a &&
        a.method === 'totp' &&
        a.timestamp === proof.verifiedAt
    )
  )
    throw new SsoError({ code: 'mfa_required' });
  const bound = await bindCurrentMfaFactor(admin, userId, proof, true);
  if (!bound) throw new SsoError({ code: 'mfa_required' });
  return { user, proof, primaryAt };
}

/** Management needs assurance, not the names shared with the external SP. */
export async function managementPrincipal(request: Request, admin: SsoAdmin) {
  const { user, proof } = await verifiedActor(request, admin);
  if (
    user.is_anonymous ||
    !user.email_confirmed_at ||
    (user.banned_until && Date.parse(user.banned_until) > Date.now())
  ) {
    throw new SsoError({ code: 'forbidden' });
  }
  return { userId: user.id, mfaAt: proof.verifiedAt };
}

export async function principal(request: Request, admin: SsoAdmin) {
  const { user, proof, primaryAt } = await verifiedActor(request, admin);
  return principalSchema.parse({
    userId: user.id,
    sessionId: proof.sessionId,
    email: user.email,
    emailConfirmed: Boolean(user.email_confirmed_at),
    accountAllowed:
      !user.is_anonymous &&
      (!user.banned_until || Date.parse(user.banned_until) <= Date.now()),
    firstName: user.user_metadata.given_name,
    lastName: user.user_metadata.family_name,
    factorCurrent: true,
    primaryAt,
    mfaAt: proof.verifiedAt,
  });
}

export async function consentIdentity(
  request: Request,
  admin: SsoAdmin,
  config: SsoConfiguration,
  state: BrowserState
) {
  const session = await browserSession(request);
  if (session) await bindSession(admin, state, session);
  const actor = await principal(request, admin);
  if (
    !session ||
    session.userId !== actor.userId ||
    session.sessionId !== actor.sessionId
  )
    await bindSession(admin, state, actor);
  const current = await snapshot(admin, config, actor.userId);
  authorizeIdentity({
    ...current,
    principal: actor,
    request: state.request,
    now: new Date(),
  });
  return { actor, current };
}
