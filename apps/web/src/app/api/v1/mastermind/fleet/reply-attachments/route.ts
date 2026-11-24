import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ATTACHMENT_LIMITS,
  attachmentKinds,
  sanitizeAttachmentName,
} from '@tuturuuu/utils/mastermind-store/reply-attachments';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_FLEET_SESSIONS,
} from '@/lib/mastermind/fleet/auth';
import {
  attachmentBridgeFailure,
  attachmentGate,
} from '@/lib/mastermind/fleet/reply-attachment-gate';
import { sealAttachmentName } from '@/lib/mastermind/fleet/reply-attachments';
import {
  FLEET_NO_STORE,
  fleetError,
  readCappedText,
} from '@/lib/mastermind/fleet/http';

const reserveSchema = z
  .object({
    machineId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u),
    environmentId: z
      .string()
      .regex(/^\w[\w-]{0,99}$/u)
      .optional(),
    threadId: z.string().regex(/^[\w:%.][\w:%.-]{0,399}$/u),
    /** The idempotency key the reply will be sent with. */
    replyId: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u),
    kind: z.enum(attachmentKinds),
    name: z.string().min(1).max(255),
    size: z.number().int().min(1),
  })
  .strict();

/**
 * Reserves one attachment for an owner thread reply that is being written.
 * The store mints the upload id, bound to this owner and session, the
 * machine, the thread and the reply id, and holds the byte and count quotas
 * before any bytes arrive. Thread replies on the bridge machine only; the
 * live machine must advertise attachments. Behind the
 * `mastermind_reply_attachments` flag, off by default.
 */
export const POST = withSessionAuth(
  async (request, { appSessionToken, user, supabase }) => {
    const gate = await attachmentGate(request, {
      user,
      userId: user.id,
      supabase,
      appSessionToken,
    });
    if (!gate.ok) return gate.response;

    const body = await readCappedText(request, 4 * 1024);
    if (body === null) return fleetError('payload_too_large', 413);
    let parsed: ReturnType<typeof reserveSchema.safeParse>;
    try {
      parsed = reserveSchema.safeParse(JSON.parse(body));
    } catch {
      return fleetError('invalid_json', 400);
    }
    if (!parsed.success) return fleetError('invalid_reply', 422);
    const input = parsed.data;
    if (input.environmentId)
      return fleetError('unsupported_for_linked_machine', 422);
    if (input.size > ATTACHMENT_LIMITS.maxFileBytes)
      return fleetError('attachment_too_large', 413);

    let live: Awaited<ReturnType<typeof gate.bridge.live>>;
    try {
      live = await gate.bridge.live();
    } catch (error) {
      return attachmentBridgeFailure(error);
    }
    const machine = live.machines.find(
      (entry) => entry.machineId === input.machineId
    );
    if (!machine?.connected) return fleetError('machine_offline', 503);
    if (!machine.attachments) return fleetError('attachments_unsupported', 409);

    const name = sanitizeAttachmentName(input.name, input.kind);
    try {
      const reserved = await gate.bridge.reserveAttachment({
        actorId: user.id.toLowerCase(),
        credential: gate.credential,
        machineId: input.machineId,
        threadId: input.threadId,
        replyId: input.replyId,
        kind: input.kind,
        size: input.size,
        meta: sealAttachmentName(gate.secret, input, name),
      });
      return NextResponse.json(
        {
          uploadId: reserved.id,
          name,
          maxBytes: input.size,
          expiresAt: new Date(reserved.expiresAt).toISOString(),
        },
        { status: 201, headers: FLEET_NO_STORE }
      );
    } catch (error) {
      return attachmentBridgeFailure(error);
    }
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 30 },
    maxPayloadSize: 4 * 1024,
    ...MASTERMIND_FLEET_SESSIONS,
    // The second-factor check in the gate is this route's step-up, as for replies.
    stepUpExempt: (user) => isFleetOwner(user),
  }
);
