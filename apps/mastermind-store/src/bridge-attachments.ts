/**
 * Attachment calls of the FleetBridge Durable Object (reserve, finalize,
 * fetch), and the owner-notice authorization call to Web. Each one runs in
 * the object's single transaction, is refused by the stop fence and charges
 * the bridge's daily operation budget before any work.
 */
import {
  type AttachmentFinalize,
  type AttachmentReserve,
  BRIDGE_REPLY_V2_VERSION,
  type bridgeSendV2Schema,
} from '@tuturuuu/utils/mastermind-store/reply-attachments';
import type { z } from 'zod';
import type { AttachmentEngine } from './attachment-engine';
import { bridgeBudget, sha256Hex } from './bridge-crypto';
import { BridgeError, type BridgeEngine } from './bridge-engine';

type Attempt = <T>(
  run: () => T
) => { ok: true; value: T } | { ok: false; error: BridgeError['code'] };

export function createAttachmentApi(host: {
  attempt: Attempt;
  engine: BridgeEngine;
  files: AttachmentEngine;
}) {
  const { attempt, engine, files } = host;
  const charge = (now: number, budget: number) => {
    if (engine.stopped()) throw new BridgeError('stopped');
    engine.chargeFrame(now, budget);
  };
  return {
    /**
     * Records a v2 reply and binds its objects in one transaction. A new
     * reply needs every object to be a ready record of this very reply,
     * owner and target; a repeat of the same id and bundle replays.
     */
    storeV2(
      input: z.output<typeof bridgeSendV2Schema>,
      budget: number,
      now: number
    ) {
      const { envelope } = input;
      const frame = JSON.stringify({
        v: BRIDGE_REPLY_V2_VERSION,
        t: 'reply',
        envelope,
        sig: input.sig,
      });
      const bind = {
        replyId: envelope.id,
        machineId: envelope.machineId,
        threadId: envelope.threadId,
        actorId: envelope.actorId,
        credential: input.credential,
        objects: envelope.objects,
        fetch: input.fetch,
        expiresAt: envelope.expiresAt,
      };
      const stored = attempt(() => {
        if (!engine.receipt(envelope.id, now)) files.assertBindable(bind, now);
        const result = engine.enqueue(
          {
            id: envelope.id,
            machineId: envelope.machineId,
            threadId: envelope.threadId,
            actorId: envelope.actorId,
            textDigest: envelope.textDigest,
            ackKey: input.ackKey,
            expiresAt: envelope.expiresAt,
            frame,
          },
          now,
          budget
        );
        if (!result.replayed) files.bind(bind);
        return result;
      });
      return { frame, stored };
    },

    reserve(input: AttachmentReserve, budget: number) {
      const now = Date.now();
      const id = crypto.randomUUID();
      const reserved = attempt(() => {
        charge(now, budget);
        return files.reserve(input, id, now);
      });
      return reserved.ok
        ? ({ ok: true, id, expiresAt: reserved.value } as const)
        : reserved;
    },

    async finalize(
      id: string,
      input: AttachmentFinalize,
      bytes: ArrayBuffer,
      budget: number
    ) {
      const sha256 = [
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      ]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const now = Date.now();
      const done = attempt(() => {
        charge(now, budget);
        return files.finalize(
          id,
          { ...input, sha256 },
          new Uint8Array(bytes),
          now
        );
      });
      return done.ok ? ({ ok: true, record: done.value } as const) : done;
    },

    /**
     * An object's bytes for the capability bound to it. Only a fetch that
     * matches its capability costs an operation, so guessed ids and
     * capabilities cannot spend the daily budget. `busy` (stop fence or
     * budget) is worth retrying; `missing` is not.
     */
    async fetch(
      id: string,
      capability: string,
      budget: number
    ): Promise<
      | { status: 'ok'; bytes: Uint8Array<ArrayBuffer> }
      | { status: 'missing' }
      | { status: 'busy' }
    > {
      const hash = await sha256Hex(capability);
      const now = Date.now();
      const result = attempt(() => {
        if (engine.stopped()) throw new BridgeError('stopped');
        const bytes = files.fetch(id, hash, now);
        // A refused budget rolls the fetch count back with the transaction.
        if (bytes) engine.chargeFrame(now, budget);
        return bytes;
      });
      if (!result.ok) return { status: 'busy' };
      return result.value
        ? { status: 'ok', bytes: result.value }
        : { status: 'missing' };
    },
  };
}

/**
 * Asks Web whether an owner may still receive notices: at most one call per
 * owner and notice, zero retries, charged before any outbound work.
 */
export async function authorizeOwnerNotice(
  env: {
    MASTERMIND_BRIDGE_DAILY_OPS?: string;
    MASTERMIND_STORE_TOKENS?: string;
  },
  ownerId: string,
  charge: (budget: number) => boolean
) {
  const token = env.MASTERMIND_STORE_TOKENS?.split(',')[0]?.trim();
  const budget = bridgeBudget(env.MASTERMIND_BRIDGE_DAILY_OPS);
  if (!token || token.length < 32 || budget === null) return false;
  if (!charge(budget)) return false;
  try {
    const response = await fetch(
      'https://tuturuuu.com/api/v1/mastermind/fleet/live/owner-authorization',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'user-agent': 'Tuturuuu-Mastermind-Store/1.0',
        },
        body: JSON.stringify({ ownerId }),
        redirect: 'manual',
        signal: AbortSignal.timeout(2_000),
      }
    );
    return response.status === 204;
  } catch {
    return false;
  }
}
