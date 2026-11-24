import { NextResponse } from 'next/server';
import {
  ATTACHMENT_LIMITS,
  attachmentIdSchema,
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
import {
  ingestAttachment,
  readExactBody,
} from '@/lib/mastermind/fleet/reply-attachments';
import { FLEET_NO_STORE, fleetError } from '@/lib/mastermind/fleet/http';

const STATUS = {
  attachment_type_unsupported: 415,
  attachment_invalid: 422,
  attachment_too_large: 413,
  attachments_unavailable: 503,
} as const;

/**
 * The bytes of one reserved attachment. The byte cap is enforced here, where
 * the bytes arrive: the body must declare and carry exactly the reserved
 * size, and the stream is cancelled the moment it goes past it. An image is
 * decoded and re-encoded, text is checked as strict UTF-8; only the derived
 * bytes are stored, and the record is finalized once, for the owner and
 * session that reserved it.
 */
export const PUT = withSessionAuth<{ uploadId: string }>(
  async (request, { appSessionToken, user, supabase }, { uploadId }) => {
    const gate = await attachmentGate(request, {
      user,
      userId: user.id,
      supabase,
      appSessionToken,
    });
    if (!gate.ok) return gate.response;
    if (!attachmentIdSchema.safeParse(uploadId).success)
      return fleetError('not_found', 404);

    const declared = request.headers.get('content-length');
    if (!declared || !/^\d{1,9}$/u.test(declared))
      return fleetError('length_required', 411);
    const size = Number(declared);
    if (size > ATTACHMENT_LIMITS.maxFileBytes)
      return fleetError('attachment_too_large', 413);

    let record: Awaited<
      ReturnType<typeof gate.bridge.attachmentRecords>
    >[number];
    try {
      record = (await gate.bridge.attachmentRecords([uploadId]))[0] ?? null;
    } catch (error) {
      return attachmentBridgeFailure(error);
    }
    // Someone else's, another session's, spent or lapsed: all look missing.
    if (
      !record ||
      record.state !== 'reserved' ||
      record.actorId !== user.id.toLowerCase() ||
      record.credential !== gate.credential ||
      record.expiresAt <= Date.now()
    )
      return fleetError('not_found', 404);
    if (size !== record.size)
      return fleetError('attachment_size_mismatch', 422);

    const bytes = await readExactBody(request, record.size);
    if (!bytes) return fleetError('attachment_size_mismatch', 422);
    const derived = await ingestAttachment(record.kind, bytes);
    if (!derived.ok) return fleetError(derived.error, STATUS[derived.error]);
    // A re-encoded image may outgrow its upload, never the per-file cap; the
    // store holds the full cap for images until finalize releases the rest.
    if (derived.bytes.byteLength > ATTACHMENT_LIMITS.maxFileBytes)
      return fleetError('attachment_too_large', 413);

    try {
      const finalized = await gate.bridge.finalizeAttachment(
        uploadId,
        {
          actorId: record.actorId,
          credential: gate.credential,
          mime: derived.mime as 'image/webp' | 'text/plain',
        },
        derived.bytes
      );
      return NextResponse.json(
        { uploadId, kind: finalized.kind, size: finalized.size },
        { status: 200, headers: FLEET_NO_STORE }
      );
    } catch (error) {
      return attachmentBridgeFailure(error);
    }
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 30 },
    maxPayloadSize: ATTACHMENT_LIMITS.maxFileBytes,
    ...MASTERMIND_FLEET_SESSIONS,
    stepUpExempt: (user) => isFleetOwner(user),
  }
);
