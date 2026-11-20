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
 * `observed()` measures usage from every response received, including a
 * discarded one; a request that failed without an answer counts as unpriced.
 * Incurred cost is therefore settled, never dropped as zero.
 */
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
    try {
      await callRoomService(access, {
        action: 'mira.room.dispatch',
        messageId,
        leaseId,
      });
    } catch {
      refused = consentRequired();
      throw refused;
    }
    let response: Response;
    try {
      response = await upstream(input, init);
    } catch (error) {
      // No answer, but the provider may have billed it: unpriced, not zero.
      steps.push({});
      await release();
      throw error;
    }
    // Error answers carry no billed usage; successful ones are measured.
    if (response.ok) steps.push(await observeStep(response));
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
