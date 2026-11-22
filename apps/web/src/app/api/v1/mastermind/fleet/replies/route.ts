import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BRIDGE_LIMITS } from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_FLEET_SESSIONS,
} from '@/lib/mastermind/fleet/auth';
import {
  bridgeFailure,
  FLEET_REPLY_LIFETIME_MS,
  fleetBridge,
  replyAssurance,
  replyMfaMaxAgeSeconds,
  replyView,
  sealFleetReply,
} from '@/lib/mastermind/fleet/bridge';
import {
  FLEET_NO_STORE,
  fleetError,
  readCappedText,
} from '@/lib/mastermind/fleet/http';

const IDEMPOTENCY_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Control and invisible characters never reach a thread. */
const UNSAFE = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]',
  'g'
);

const replyInputSchema = z
  .object({
    machineId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u),
    environmentId: z
      .string()
      .regex(/^\w[\w-]{0,99}$/u)
      .optional(),
    threadId: z.string().regex(/^[\w:%.][\w:%.-]{0,399}$/u),
    text: z
      .string()
      .min(1)
      .max(BRIDGE_LIMITS.maxTextChars * 2),
    idempotencyKey: z.string().optional(),
  })
  .strict();

/**
 * Owner reply into an existing fleet thread. Web checks the owner, the
 * platform's account second-factor policy and a recent second-factor proof
 * of this very session, seals and signs the reply for the machine and hands
 * it to the bridge, which pushes it at once and keeps it
 * until the machine acknowledges. The machine delivers it steered (into the
 * running turn, or starting an idle thread); the receipt says which. Text
 * only: no attachments, no commands, no new threads.
 */
export const POST = withSessionAuth(
  async (request, { user, supabase }) => {
    if (!(await isFleetOwner(user))) return fleetError('forbidden', 403);

    const maxAgeSeconds = replyMfaMaxAgeSeconds();
    const assurance = await replyAssurance(
      request,
      { userId: user.id, supabase },
      maxAgeSeconds
    );
    if (assurance.status === 'unavailable')
      return fleetError('unavailable', 503);
    if (assurance.status !== 'allowed')
      return NextResponse.json(
        { error: 'mfa_required', maxAgeSeconds },
        { status: 401, headers: FLEET_NO_STORE }
      );

    const body = await readCappedText(request, 32 * 1024);
    if (body === null) return fleetError('payload_too_large', 413);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return fleetError('invalid_json', 400);
    }
    const parsed = replyInputSchema.safeParse(json);
    if (!parsed.success) return fleetError('invalid_reply', 422);
    const text = parsed.data.text.replace(UNSAFE, '').trim();
    if (!text || text.length > BRIDGE_LIMITS.maxTextChars)
      return fleetError('invalid_reply', 422);
    const id = (
      request.headers.get('idempotency-key') ??
      parsed.data.idempotencyKey ??
      ''
    ).trim();
    if (!IDEMPOTENCY_KEY.test(id))
      return fleetError('idempotency_key_required', 400);

    const bridge = fleetBridge();
    if (!bridge) return fleetError('unavailable', 503);
    const now = Date.now();
    const sealed = sealFleetReply({
      id,
      machineId: parsed.data.machineId,
      ...(parsed.data.environmentId
        ? { environmentId: parsed.data.environmentId }
        : {}),
      threadId: parsed.data.threadId,
      text,
      actorId: user.id.toLowerCase(),
      issuedAt: now,
      expiresAt: now + FLEET_REPLY_LIFETIME_MS,
    });
    if (!sealed) return fleetError('unconfigured', 503);
    try {
      const { receipt, replayed } = await bridge.send({
        ...sealed,
        waitMs: BRIDGE_LIMITS.maxWaitMs,
      });
      const view = replyView(receipt);
      // Audit trail (the bridge keeps the durable record): who, where, digest.
      if (!replayed)
        console.info('Mastermind fleet reply', {
          replyId: id,
          actorId: sealed.envelope.actorId,
          sessionId: assurance.proof.sessionId,
          machineId: sealed.envelope.machineId,
          threadId: sealed.envelope.threadId,
          textDigest: sealed.envelope.textDigest,
          state: view.state,
        });
      return NextResponse.json(view, {
        status: 202,
        headers: FLEET_NO_STORE,
      });
    } catch (error) {
      return bridgeFailure(error);
    }
  },
  {
    // Retries reuse their key and cost nothing at the bridge, which enforces
    // the real per-thread and hourly limits; this only bounds a runaway client.
    rateLimit: { windowMs: 60_000, maxRequests: 60 },
    maxPayloadSize: 32 * 1024,
    ...MASTERMIND_FLEET_SESSIONS,
    // The phone cannot solve the browser Turnstile step-up; the second-factor
    // check above is the gate for this route.
    stepUpExempt: (user) => isFleetOwner(user),
  }
);
