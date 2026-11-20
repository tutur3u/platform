import 'server-only';
import {
  type MeetGenerationStep,
  measureMeetGeneration,
} from '@tuturuuu/ai/meetings/chat-generation-usage';
import type { MeetChatModel } from '@tuturuuu/ai/meetings/chat-usage';
import { MIRA_ROOM_CONSENT_REQUIRED } from '@tuturuuu/realtime/meet';
import { MeetCallAccessError } from '../../call/lib/call-access';
import {
  callRoomService,
  type SignedInMeetCallAccess,
} from '../../call/server/room-service';

const consentRequired = () =>
  new MeetCallAccessError(
    409,
    MIRA_ROOM_CONSENT_REQUIRED,
    'MIRA_ROOM_CONSENT_REQUIRED'
  );

/** Usage metadata from a non-streaming Gemini response; empty when unknown. */
async function observeStep(response: Response): Promise<MeetGenerationStep> {
  try {
    const body = (await response.clone().json()) as {
      usageMetadata?: unknown;
      candidates?: Array<{ groundingMetadata?: unknown }>;
    };
    return {
      providerMetadata: {
        google: {
          usageMetadata: body.usageMetadata,
          groundingMetadata: body.candidates?.[0]?.groundingMetadata,
        },
      },
    };
  } catch {
    return {};
  }
}

/**
 * Provider fetch for room Mira generation. Every outbound provider request
 * (each model step and the model-backed web search) is bracketed by a room
 * dispatch lease: the room admits it only while the all-participant fence
 * and every source revision are current, serialized with consent changes,
 * and the release reports whether consent stayed unchanged until the
 * response arrived. A change during the lease discards that response and
 * refuses every later request. The provider key and destination stay in
 * this Worker; the room only records admission.
 *
 * The lease lifetime the room returns bounds each request: nothing is sent
 * once the caller's signal is aborted or the lease has expired, transport
 * aborts at the deadline, and usage observation stops there too, after which
 * the request is refused as expired and later requests are refused.
 *
 * `observed()` measures usage from every response received, including a
 * discarded one; a request interrupted after it was sent counts as unpriced.
 * Incurred cost is therefore settled, never dropped as zero.
 */
const leaseExpired = () =>
  new MeetCallAccessError(
    503,
    'Room Mira request expired',
    'MIRA_ROOM_LEASE_EXPIRED'
  );

/** Resolves to undefined when `ms` elapses first. */
async function within<T>(work: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), Math.max(0, ms));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function roomMiraProviderFetch(
  access: SignedInMeetCallAccess,
  messageId: string,
  model: MeetChatModel,
  upstream: typeof fetch = fetch
) {
  let refused: MeetCallAccessError | undefined;
  const steps: MeetGenerationStep[] = [];
  const guarded = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (refused) throw refused;
    const leaseId = crypto.randomUUID();
    const release = () =>
      callRoomService<{ current?: boolean }>(access, {
        action: 'mira.room.release',
        messageId,
        leaseId,
      }).catch(() => ({ current: false }));
    const expire = async () => {
      await release();
      refused = leaseExpired();
      throw refused;
    };
    // Measured before admission, so this deadline never outlasts the room's.
    const requestedAt = Date.now();
    let lifetime: unknown;
    try {
      lifetime = (
        await callRoomService<{ expiresInMs?: unknown }>(access, {
          action: 'mira.room.dispatch',
          messageId,
          leaseId,
        })
      ).expiresInMs;
    } catch {
      refused = consentRequired();
      throw refused;
    }
    if (typeof lifetime !== 'number' || !(lifetime > 0)) return expire();
    const deadline = requestedAt + lifetime;
    const remaining = () => deadline - Date.now();
    // The caller's cancellation: init.signal when supplied, otherwise the
    // Request input's own signal, so a cancelled Request never reaches transport.
    const callerSignal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (callerSignal?.aborted) {
      await release();
      throw callerSignal.reason ?? new Error('Provider request aborted');
    }
    // Remaining lease time, computed once right before the timeout exists.
    const budgetMs = Math.floor(remaining());
    if (!Number.isSafeInteger(budgetMs) || budgetMs <= 0) return expire();
    let timeout: AbortSignal;
    let signal: AbortSignal;
    try {
      timeout = AbortSignal.timeout(budgetMs);
      signal = callerSignal
        ? AbortSignal.any([callerSignal, timeout])
        : timeout;
    } catch (error) {
      await release();
      throw error;
    }
    // Signal construction can itself take time: recheck the absolute deadline
    // and the combined signal synchronously, with no yield before transport.
    if (signal.aborted || remaining() <= 0) {
      if (callerSignal?.aborted) {
        await release();
        throw callerSignal.reason ?? new Error('Provider request aborted');
      }
      return expire();
    }
    let response: Response;
    try {
      response = await upstream(input, { ...init, signal });
    } catch (error) {
      // No answer, but the provider may have billed it: unpriced, not zero.
      steps.push({});
      if (timeout.aborted) return expire();
      await release();
      throw error;
    }
    if (response.ok) {
      // Error answers carry no billed usage; successful ones are measured
      // within the lease, otherwise counted as unpriced.
      const step = await within(observeStep(response), remaining());
      steps.push(step ?? {});
      if (!step) return expire();
    }
    if (remaining() <= 0) return expire();
    if ((await release()).current !== true) {
      refused = consentRequired();
      throw refused;
    }
    return response;
  }) as typeof fetch;
  return {
    fetch: guarded,
    withdrawn: () => refused,
    sent: () => steps.length > 0,
    observed: () => (steps.length ? measureMeetGeneration(steps, model) : null),
  };
}
