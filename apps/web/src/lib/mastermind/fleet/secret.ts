import 'server-only';

import { createHash, createPublicKey, verify } from 'node:crypto';
import type { MastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { NextResponse, type NextRequest } from 'next/server';
import { type FleetAssurancePrincipal, replyAssurance } from './bridge';
import type {
  FleetAnswerInput,
  FleetAnswerRecord,
  FleetDecision,
} from './contract';
import { FLEET_NO_STORE, fleetError } from './http';
import {
  type FleetSecret,
  type FleetSecretAction,
  type FleetSecretRequest,
  SECRET_ANSWER_CUTOFF_MS,
  SECRET_PAIR_MAX_REVISIONS,
} from './secret-contract';
import {
  FleetAnswerClosedError,
  FleetAnswerConflictError,
  recordFleetAnswer,
  replayFleetAnswer,
} from './store';

/**
 * Web relay rules for Mastermind secret entry: the owner's step-up, the
 * owner signature checked against the stored request before any slot is
 * claimed, once-only answers and the expiry cutoff. Web only relays: the
 * sealed value is opaque here and opened on the requesting machine.
 * Design: apps/docs/build/devops/mastermind-secret-entry.mdx#relay-web-and-store.
 */
export const REQUEST_DOMAIN = 'tuturuuu-mm-secret-request-v1';
export const ANSWER_DOMAIN = 'tuturuuu-mm-secret-answer-v1';
export const OWNER_DOMAIN = 'tuturuuu-mm-secret-owner-v1';

/** Request fields after the domain, in protocol order. */
const REQUEST_FIELDS = [
  'v',
  'requestId',
  'machineId',
  'requester',
  'operation',
  'command',
  'output',
  'purpose',
  'expiresAt',
  'publicKey',
  'signerKey',
  'audience',
] as const;
type RequestFields = Pick<FleetSecretRequest, (typeof REQUEST_FIELDS)[number]>;

const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');
/** A secret record, and with it a same-key replay, outlives expiry by this. */
const SECRET_KEEP_AFTER_EXPIRY_MS = 10 * 60 * 1000;
const MFA_DEFAULT_MAX_AGE_SECONDS = 300;
const MFA_BOUNDS = { min: 60, max: 300 };

const sha256Hex = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

/** `B(domain, fields)`: each part as a 4-byte big-endian length and UTF-8. */
export function lengthPrefixed(domain: string, values: readonly string[]) {
  const parts: Buffer[] = [];
  for (const value of [domain, ...values]) {
    const bytes = Buffer.from(value, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    parts.push(length, bytes);
  }
  return Buffer.concat(parts);
}

export const bindingBytes = (domain: string, request: RequestFields) =>
  lengthPrefixed(
    domain,
    REQUEST_FIELDS.map((field) => request[field])
  );

/** First 16 bytes of SHA-256 of an owner key, as lowercase hex. */
export const ownerKeyId = (ownerKey: Uint8Array) =>
  sha256Hex(ownerKey).slice(0, 32);

/** What the owner signs: the request digest, action, payload, time and key. */
export const ownerTranscript = (
  request: RequestFields,
  answer: {
    action: string;
    enc: string;
    ct: string;
    signedAt: string;
    keyId: string;
  }
) =>
  lengthPrefixed(OWNER_DOMAIN, [
    request.requestId,
    sha256Hex(bindingBytes(REQUEST_DOMAIN, request)),
    answer.action,
    answer.enc,
    answer.ct,
    answer.signedAt,
    answer.keyId,
  ]);

export function verifyEd25519(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
) {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  try {
    return verify(
      null,
      message,
      createPublicKey({
        key: Buffer.concat([ED25519_SPKI, publicKey]),
        format: 'der',
        type: 'spki',
      }),
      signature
    );
  } catch {
    return false;
  }
}

/**
 * Whether a `secret` or `decline` answer carries a valid owner signature
 * for this stored request: the key matches its id, the id is in the signed
 * audience, it was signed by `expiresAt`, and the Ed25519 signature
 * verifies over the transcript rebuilt from the stored request.
 */
export function ownerAnswerVerifies(
  request: FleetSecretRequest,
  input: FleetAnswerInput
) {
  const { owner, sealed } = input;
  if (!owner || (input.action !== 'secret' && input.action !== 'decline'))
    return false;
  const publicKey = Buffer.from(owner.publicKey, 'base64url');
  if (ownerKeyId(publicKey) !== owner.keyId) return false;
  if (!request.audience.split(',').includes(owner.keyId)) return false;
  if (Date.parse(owner.signedAt) > Date.parse(request.expiresAt)) return false;
  const transcript = ownerTranscript(request, {
    action: input.action,
    enc: input.action === 'secret' ? (sealed?.enc ?? '') : '',
    ct: input.action === 'secret' ? (sealed?.ct ?? '') : '',
    signedAt: owner.signedAt,
    keyId: owner.keyId,
  });
  return verifyEd25519(
    publicKey,
    transcript,
    Buffer.from(owner.sig, 'base64url')
  );
}

/** New answers stop 15 seconds before `expiresAt` on the server clock. */
export const secretAnswerOpen = (secret: FleetSecret, now = Date.now()) =>
  now <= Date.parse(secret.expiresAt) - SECRET_ANSWER_CUTOFF_MS;

/** How recent the step-up must be for `secret` and `pair` (60 to 300 s). */
export function secretMfaMaxAgeSeconds(
  env: Record<string, string | undefined> = process.env
) {
  const raw = env.MASTERMIND_SECRET_MFA_MAX_AGE_SECONDS?.trim();
  if (!raw || !/^\d{1,6}$/u.test(raw)) return MFA_DEFAULT_MAX_AGE_SECONDS;
  return Math.min(MFA_BOUNDS.max, Math.max(MFA_BOUNDS.min, Number(raw)));
}

/**
 * The step-up a secret action needs, or the response refusing it. `secret`
 * and `pair` need a second-factor proof of this very session; `decline`
 * needs the session only.
 */
export async function secretAnswerAssurance(
  request: Pick<NextRequest, 'headers' | 'url'>,
  principal: FleetAssurancePrincipal,
  action: FleetSecretAction
): Promise<NextResponse | null> {
  if (action === 'decline') return null;
  const maxAgeSeconds = secretMfaMaxAgeSeconds();
  const assurance = await replyAssurance(request, principal, maxAgeSeconds);
  if (assurance.status === 'unavailable') return fleetError('unavailable', 503);
  if (assurance.status === 'allowed') return null;
  return NextResponse.json(
    { error: 'mfa_required', maxAgeSeconds },
    { status: 401, headers: FLEET_NO_STORE }
  );
}

/** Time, request id and outcome only: never payloads, keys or actors. */
function logSecretAnswer(requestId: string, outcome: string, now: Date) {
  console.info('Mastermind fleet secret answer', {
    at: now.toISOString(),
    requestId,
    outcome,
  });
}

export type SecretAnswerResult =
  | { ok: true; answer: FleetAnswerRecord }
  | {
      ok: false;
      error: 'invalid_answer' | 'secret_closed' | 'idempotency_conflict';
      status: 409 | 422;
    };

const actionFits = (secret: FleetSecret, action: string) =>
  secret.mode === 'request'
    ? action === 'secret' || action === 'decline'
    : action === 'pair';

/**
 * Records a secret answer, or says why not. `decision` is the open decision
 * from the stored snapshot (undefined once it left). A retry with the same
 * Idempotency-Key, actor and payload replays its receipt, also after the
 * decision closed or the orchestrator picked the answer up.
 */
export async function answerSecretDecision(
  store: MastermindStore,
  decisionId: string,
  decision: FleetDecision | undefined,
  input: FleetAnswerInput,
  idempotencyKey: string,
  actorId: string,
  now = new Date()
): Promise<SecretAnswerResult> {
  const refuse = (
    error: 'invalid_answer' | 'secret_closed' | 'idempotency_conflict',
    status: 409 | 422
  ): SecretAnswerResult => {
    logSecretAnswer(decisionId, error, now);
    return { ok: false, error, status };
  };
  const replayOrClosed = async () => {
    const replay = await replayFleetAnswer(
      store,
      decisionId,
      input,
      idempotencyKey,
      actorId
    );
    if (!replay) return refuse('secret_closed', 409);
    logSecretAnswer(decisionId, 'replayed', now);
    return { ok: true as const, answer: replay };
  };

  if (!decision) return replayOrClosed();
  const secret = decision.kind === 'secret' ? decision.secret : undefined;
  if (!secret || !actionFits(secret, input.action))
    return refuse('invalid_answer', 422);
  if (secret.mode === 'request' && !ownerAnswerVerifies(secret, input))
    return refuse('invalid_answer', 422);
  if (!secretAnswerOpen(secret, now.getTime())) return replayOrClosed();

  try {
    const answer = await recordFleetAnswer(
      store,
      decisionId,
      input,
      idempotencyKey,
      now,
      actorId,
      {
        maxRevisions: secret.mode === 'request' ? 1 : SECRET_PAIR_MAX_REVISIONS,
        keepUntil: new Date(
          Date.parse(secret.expiresAt) + SECRET_KEEP_AFTER_EXPIRY_MS
        ),
      }
    );
    logSecretAnswer(decisionId, 'accepted', now);
    return { ok: true, answer };
  } catch (error) {
    if (error instanceof FleetAnswerClosedError)
      return refuse('secret_closed', 409);
    if (error instanceof FleetAnswerConflictError)
      return refuse('idempotency_conflict', 409);
    throw error;
  }
}
