import 'server-only';

import type { MastermindBridge } from '@tuturuuu/utils/mastermind-store/bridge-client';
import {
  ATTACHMENT_LIMITS,
  type AttachmentFile,
  attachmentFileSchema,
} from '@tuturuuu/utils/mastermind-store/reply-attachments';
import type { NextResponse } from 'next/server';
import { fleetError } from './http';
import { attachmentBridgeFailure } from './reply-attachment-gate';
import {
  attachmentCredential,
  openAttachmentName,
  sealFleetReplyV2,
} from './reply-attachments';

export interface ReplyV2Request {
  bridge: MastermindBridge;
  secret: string;
  sessionId: string;
  actorId: string;
  id: string;
  machineId: string;
  threadId: string;
  text: string;
  uploadIds: string[];
  now: number;
}

/**
 * Builds the sealed v2 reply from its upload records. Each one must belong
 * to this owner and session, this machine and thread and this reply id, and
 * be finalized; a retry of a reply already sent finds them bound or
 * released, and rebuilds the identical bundle (its times come from the
 * records, not the clock), so the store returns the first receipt.
 */
export async function prepareReplyV2(
  input: ReplyV2Request
): Promise<
  | { ok: true; sealed: ReturnType<typeof sealFleetReplyV2>; bytes: number[] }
  | { ok: false; response: NextResponse }
> {
  const refuse = (response: NextResponse) => ({ ok: false, response }) as const;
  if (new Set(input.uploadIds).size !== input.uploadIds.length)
    return refuse(fleetError('invalid_reply', 422));
  let records: Awaited<ReturnType<MastermindBridge['attachmentRecords']>>;
  try {
    records = await input.bridge.attachmentRecords(input.uploadIds);
  } catch (error) {
    return refuse(attachmentBridgeFailure(error));
  }
  const credential = attachmentCredential(input.secret, input.sessionId);
  const files: AttachmentFile[] = [];
  let total = 0;
  let issuedAt = 0;
  let expiresAt = Number.POSITIVE_INFINITY;
  for (const record of records) {
    const usable =
      record &&
      record.actorId === input.actorId &&
      record.credential === credential &&
      record.machineId === input.machineId &&
      record.threadId === input.threadId &&
      record.replyId === input.id &&
      (record.state === 'ready' ||
        record.state === 'bound' ||
        record.state === 'released') &&
      record.sha256 &&
      record.mime &&
      record.finalizedAt !== undefined;
    if (!usable) return refuse(fleetError('attachment_refused', 409));
    const name = openAttachmentName(
      input.secret,
      { replyId: input.id, machineId: input.machineId },
      record.meta
    );
    const file = attachmentFileSchema.safeParse({
      id: record.id,
      kind: record.kind,
      mime: record.mime,
      size: record.size,
      sha256: record.sha256,
      name,
    });
    if (!file.success) return refuse(fleetError('attachment_refused', 409));
    files.push(file.data);
    total += record.size;
    issuedAt = Math.max(issuedAt, record.finalizedAt ?? 0);
    expiresAt = Math.min(expiresAt, record.expiresAt);
  }
  if (
    files.length > ATTACHMENT_LIMITS.maxFiles ||
    total > ATTACHMENT_LIMITS.maxReplyBytes
  )
    return refuse(fleetError('attachment_limit', 409));
  // A new reply needs time left to reach the machine; a settled one replays.
  const fresh = records.every((record) => record?.state === 'ready');
  if (fresh && expiresAt - input.now < ATTACHMENT_LIMITS.minRemainingMs)
    return refuse(fleetError('attachment_expired', 410));
  return {
    ok: true,
    sealed: sealFleetReplyV2(input.secret, {
      id: input.id,
      machineId: input.machineId,
      threadId: input.threadId,
      actorId: input.actorId,
      text: input.text,
      files,
      issuedAt,
      expiresAt,
    }),
    bytes: files.map((file) => file.size),
  };
}
