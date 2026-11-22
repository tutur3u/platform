import 'server-only';

import {
  createCipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomBytes,
  verify,
} from 'node:crypto';
import {
  getAppSessionTokenFromRequest,
  verifyAppSessionRequestWithToken,
} from '@tuturuuu/auth/app-session-core';
import {
  createAdminClient,
  getBearerAccessToken,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  configuredMastermindBridge,
  type MastermindBridge,
  MastermindBridgeError,
} from '@tuturuuu/utils/mastermind-store/bridge-client';
import {
  BRIDGE_ACK_KEY_INFO,
  BRIDGE_DIGEST_KEY_INFO,
  BRIDGE_SEAL_KEY_INFO,
  OWNER_LIVE_LEASE_MS,
  type BridgeReceipt,
  type BridgeReplyEnvelope,
  bridgeAckSigningString,
  bridgeReplySigningString,
  bridgeSealContext,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import type { MfaSessionProof } from '@tuturuuu/utils/required-mfa-policy';
import { mfaProofFromVerifiedClaims } from '@tuturuuu/utils/required-mfa-policy';
import { checkRequiredAccountMfa } from '@tuturuuu/utils/required-mfa-request';
import type { NextRequest } from 'next/server';
import { isFreshMfaProof } from '@/lib/auth/mfa-proof-age';
import { MASTERMIND_PUSH_MIN_SECRET_LENGTH } from '@/lib/mastermind/push-events/signature';
import { fleetError } from './http';

/** A thread reply needs a second-factor check this recent, by default. */
export const FLEET_REPLY_MFA_DEFAULT_MAX_AGE_SECONDS = 30 * 60;
const MFA_MAX_AGE_BOUNDS = { min: 60, max: 12 * 60 * 60 };
/** How long the machine may still deliver a reply after Web signed it. */
export const FLEET_REPLY_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function fleetBridge(
  env: Record<string, string | undefined> = process.env
): MastermindBridge | null {
  return configuredMastermindBridge(env);
}

export function replyMfaMaxAgeSeconds(
  env: Record<string, string | undefined> = process.env
) {
  const raw = env.MASTERMIND_REPLY_MFA_MAX_AGE_SECONDS?.trim();
  if (!raw || !/^\d{1,6}$/u.test(raw))
    return FLEET_REPLY_MFA_DEFAULT_MAX_AGE_SECONDS;
  const value = Number(raw);
  return value >= MFA_MAX_AGE_BOUNDS.min && value <= MFA_MAX_AGE_BOUNDS.max
    ? value
    : FLEET_REPLY_MFA_DEFAULT_MAX_AGE_SECONDS;
}

export { isFreshMfaProof };

export type ClaimsReader = {
  auth: {
    getClaims: (jwt?: string) => Promise<{
      data: { claims: Record<string, unknown> } | null;
      error: unknown;
    }>;
    getUser: (jwt?: string) => Promise<unknown>;
  };
};

/**
 * The route's client, reading claims from the credential this request
 * carried. A client built from a bearer token holds no session, so asked for
 * its claims it has none; the bearer is therefore named, and verified, when
 * the claims are read. Only the token the client was built from is named:
 * an Authorization value the client did not authenticate with (another
 * scheme spelling, say, beside a cookie session) could carry another
 * session's proof, and is never read. A cookie session is read as it is. An
 * app session token is not a provider token and is never read this way.
 */
function credentialClient(
  request: Pick<NextRequest, 'headers'>,
  supabase: ClaimsReader
): ClaimsReader {
  const bearer = getBearerAccessToken(request);
  const jwt = bearer && !bearer.startsWith('ttr_app_') ? bearer : undefined;
  if (!jwt) return supabase;
  return {
    auth: {
      getClaims: () => supabase.auth.getClaims(jwt),
      // The client already sends this bearer, which is how the route
      // itself resolved the user.
      getUser: () => supabase.auth.getUser(),
    },
  };
}

export type FleetAssurancePrincipal = {
  userId: string;
  supabase: ClaimsReader;
  appSessionToken?: string;
};

export type ReplyAssurance =
  | { status: 'allowed'; proof: MfaSessionProof }
  | { status: 'required' }
  | { status: 'unavailable' };

/**
 * Whether the session that authenticated this request may post a reply now.
 *
 * First the platform's own account check, for exactly the principal the route
 * admitted and the credential it used: a recovery, a removed factor, a
 * banned account or a proof issued for another user all fail there, on this
 * very request. Then this route's own rule on top: a second-factor proof of
 * that same session, no older than `maxAgeSeconds`. The proof lives inside
 * the signed app session token, or in the verified claims of the browser
 * session, so another device or session cannot lend it.
 */
export async function replyAssurance(
  request: Pick<NextRequest, 'headers' | 'url'>,
  principal: FleetAssurancePrincipal,
  maxAgeSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<ReplyAssurance> {
  const appToken = principal.appSessionToken;
  const client = credentialClient(request, principal.supabase);
  const account = await checkRequiredAccountMfa(
    request,
    {
      createUserClient: async () => client as unknown as TypedSupabaseClient,
      createAdminClient: async () =>
        (await createAdminClient({ noCookie: true })) as TypedSupabaseClient,
      nowSeconds: () => nowSeconds,
    },
    { userId: principal.userId, ...(appToken ? { appToken } : {}) }
  );
  if (account.status === 'unavailable') return { status: 'unavailable' };
  if (account.status !== 'allowed') return { status: 'required' };

  let proof = account.proof;
  if (!proof && !appToken) {
    // An account without the required-MFA policy: the platform check did not
    // need a proof, this route still does. Same principal, verified claims.
    try {
      const claims = await client.auth.getClaims();
      if (
        !claims.error &&
        claims.data &&
        claims.data.claims.sub === principal.userId
      )
        proof = mfaProofFromVerifiedClaims(claims.data.claims, nowSeconds);
    } catch {
      proof = null;
    }
  }
  return proof && isFreshMfaProof(proof, maxAgeSeconds, nowSeconds)
    ? { status: 'allowed', proof }
    : { status: 'required' };
}

/**
 * Whether the platform's account second-factor policy lets this principal
 * read fleet threads. Reads do not need the fresh proof a reply needs, but a
 * recovery, a removed factor or a banned account stops them on the spot.
 */
export async function readAssurance(
  request: Pick<NextRequest, 'headers' | 'url'>,
  principal: FleetAssurancePrincipal,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<'allowed' | 'required' | 'unavailable'> {
  const appToken = principal.appSessionToken;
  const client = credentialClient(request, principal.supabase);
  const account = await checkRequiredAccountMfa(
    request,
    {
      createUserClient: async () => client as unknown as TypedSupabaseClient,
      createAdminClient: async () =>
        (await createAdminClient({ noCookie: true })) as TypedSupabaseClient,
      nowSeconds: () => nowSeconds,
    },
    { userId: principal.userId, ...(appToken ? { appToken } : {}) }
  );
  if (account.status === 'unavailable') return 'unavailable';
  return account.status === 'allowed' ? 'allowed' : 'required';
}

const OWNER_LIVE_MFA_MAX_AGE_SECONDS = 24 * 60 * 60;

/** No socket can outlive its verified access credential or MFA proof. */
export async function ownerLiveLease(
  request: Pick<NextRequest, 'headers' | 'url'>,
  principal: { userId: string; supabase: ClaimsReader },
  now = Date.now()
) {
  const session = getAppSessionTokenFromRequest(request)
    ? verifyAppSessionRequestWithToken(request, { targetApp: 'mastermind' })
    : null;
  if (session && (!session.ok || session.claims.sub !== principal.userId))
    return { status: 'required' } as const;
  const assurance = await replyAssurance(
    request,
    { ...principal, appSessionToken: session?.token },
    OWNER_LIVE_MFA_MAX_AGE_SECONDS,
    Math.floor(now / 1000)
  );
  if (assurance.status !== 'allowed') return assurance;

  let sessionExpiresAt: number | undefined;
  if (session) {
    sessionExpiresAt = session.claims.exp;
  } else {
    try {
      const result = await credentialClient(
        request,
        principal.supabase
      ).auth.getClaims();
      const claims = result.data?.claims;
      if (
        !result.error &&
        claims?.sub === principal.userId &&
        typeof claims.exp === 'number' &&
        Number.isSafeInteger(claims.exp)
      )
        sessionExpiresAt = claims.exp;
    } catch {
      return { status: 'unavailable' } as const;
    }
  }
  if (sessionExpiresAt === undefined) return { status: 'unavailable' } as const;
  const leaseExpiresAt = Math.min(
    now + OWNER_LIVE_LEASE_MS,
    sessionExpiresAt * 1000,
    (assurance.proof.verifiedAt + OWNER_LIVE_MFA_MAX_AGE_SECONDS) * 1000,
    (assurance.proof.expiresAt ?? Number.POSITIVE_INFINITY) * 1000
  );
  return leaseExpiresAt > now
    ? ({ status: 'allowed', leaseExpiresAt } as const)
    : ({ status: 'required' } as const);
}

/** The fleet secret, or null when it is missing or too short to use. */
export function fleetSecret(env: Record<string, string | undefined>) {
  const secret = env.MASTERMIND_FLEET_PUBLISHER_SECRET?.trim();
  return secret && secret.length >= MASTERMIND_PUSH_MIN_SECRET_LENGTH
    ? secret
    : null;
}

/** A purpose-bound 32-byte key derived from the fleet secret. */
export const derive = (secret: string, info: string) =>
  Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), info, 32));

/** PKCS#8 wrapping of a raw 32-byte Ed25519 seed. */
const ED25519_PKCS8_PREFIX = Buffer.from(
  '302e020100300506032b657004220420',
  'hex'
);

/**
 * The public half of the machine's acknowledgement key. The machine derives
 * the private half from the same fleet secret; Web and the store only ever
 * verify with this one.
 */
function ackPublicKey(secret: string) {
  return createPublicKey(
    createPrivateKey({
      key: Buffer.concat([
        ED25519_PKCS8_PREFIX,
        derive(secret, BRIDGE_ACK_KEY_INFO),
      ]),
      format: 'der',
      type: 'pkcs8',
    })
  );
}

export interface FleetReplyInput {
  id: string;
  machineId: string;
  environmentId?: string;
  threadId: string;
  text: string;
  actorId: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Seals and signs a reply for the machine. The text is encrypted with a key
 * derived from the fleet secret, which the store Worker never holds, so the
 * Worker relays and keeps only ciphertext; the record it keeps is a keyed
 * digest, not a hash anyone could test guesses against. The signature covers
 * every field, and its first line is the reply domain, so it fits no
 * publisher route and no publisher signature fits a reply. Null without the
 * secret.
 */
export function sealFleetReply(
  input: FleetReplyInput,
  env: Record<string, string | undefined> = process.env
): { envelope: BridgeReplyEnvelope; sig: string; ackKey: string } | null {
  const secret = fleetSecret(env);
  if (!secret) return null;
  const { text, ...fields } = input;
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    derive(secret, BRIDGE_SEAL_KEY_INFO),
    iv
  );
  cipher.setAAD(
    Buffer.from(bridgeSealContext(input.id, input.machineId), 'utf8')
  );
  const sealed = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const envelope: BridgeReplyEnvelope = {
    ...fields,
    box: { iv: iv.toString('base64url'), data: sealed.toString('base64url') },
    textDigest: createHmac('sha256', derive(secret, BRIDGE_DIGEST_KEY_INFO))
      .update(text, 'utf8')
      .digest('hex'),
  };
  return {
    envelope,
    sig: createHmac('sha256', secret)
      .update(bridgeReplySigningString(envelope), 'utf8')
      .digest('hex'),
    // The raw 32-byte public key: the last bytes of its SPKI encoding.
    ackKey: ackPublicKey(secret)
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('base64url'),
  };
}

/**
 * The receipt as far as Web can vouch for it. `delivered` and `failed` count
 * only with the machine's own Ed25519 signature over that outcome, checked
 * here under the key derived from the fleet secret (not the one the store
 * keeps); anything reported without it is still just `sent`.
 */
export function verifiedReceipt(
  receipt: BridgeReceipt,
  env: Record<string, string | undefined> = process.env
): BridgeReceipt {
  if (receipt.state !== 'delivered' && receipt.state !== 'failed')
    return receipt;
  const secret = fleetSecret(env);
  let verified = false;
  try {
    verified =
      secret !== null &&
      /^[0-9a-f]{128}$/u.test(receipt.ackSig ?? '') &&
      verify(
        null,
        Buffer.from(
          bridgeAckSigningString({
            id: receipt.id,
            machineId: receipt.machineId,
            state: receipt.state,
            ...(receipt.delivery ? { delivery: receipt.delivery } : {}),
            ...(receipt.code ? { code: receipt.code } : {}),
            textDigest: receipt.textDigest,
          }),
          'utf8'
        ),
        ackPublicKey(secret),
        Buffer.from(receipt.ackSig ?? '', 'hex')
      );
  } catch {
    verified = false;
  }
  if (verified) return receipt;
  console.warn('Mastermind bridge acknowledgement failed verification');
  return {
    id: receipt.id,
    machineId: receipt.machineId,
    threadId: receipt.threadId,
    ...(receipt.environmentId ? { environmentId: receipt.environmentId } : {}),
    state: 'sent',
    createdAt: receipt.createdAt,
    textDigest: receipt.textDigest,
  };
}

/** What a client sees of a reply: its verified state, never its text. */
export function replyView(
  receipt: BridgeReceipt,
  env: Record<string, string | undefined> = process.env
) {
  const verified = verifiedReceipt(receipt, env);
  return {
    id: verified.id,
    machineId: verified.machineId,
    threadId: verified.threadId,
    ...(verified.environmentId
      ? { environmentId: verified.environmentId }
      : {}),
    state: verified.state,
    ...(verified.delivery ? { delivery: verified.delivery } : {}),
    ...(verified.code ? { code: verified.code } : {}),
    createdAt: new Date(verified.createdAt).toISOString(),
    ...(verified.settledAt === undefined
      ? {}
      : { settledAt: new Date(verified.settledAt).toISOString() }),
  };
}

/** Closed-set error for a failed bridge call; nothing from the request is echoed. */
export function bridgeFailure(error: unknown) {
  const code = error instanceof MastermindBridgeError ? error.code : 'unknown';
  if (code === 'rate_limited') return fleetError('rate_limited', 429);
  if (code === 'conflict') return fleetError('idempotency_conflict', 409);
  if (code === 'full') return fleetError('outbox_full', 507);
  if (code === 'budget') return fleetError('budget_exhausted', 429);
  if (code === 'stopped') return fleetError('stopped', 503);
  console.warn('Mastermind bridge call failed', { code });
  return fleetError('unavailable', 503);
}
