import { meetAiResponse } from '@tuturuuu/meet-core/features/meeting-ai/server/access';
import { deliverSelfOutbox } from '@tuturuuu/meet-core/features/meeting-ai/server/self-v1-outbox-delivery';

/** Realtime room outbox delivery; accepts only the room's service credential. */
export async function POST(request: Request) {
  return meetAiResponse(() => deliverSelfOutbox(request));
}
