import type { DefaultChatTransport } from '@tuturuuu/ai/core';
import { AI_TEMP_AUTH_HEADER } from '@tuturuuu/utils/ai-temp-auth-constants';
import { getMiraTempAuthHeaders } from './mira-temp-auth-client';

type PrepareRequest = NonNullable<
  NonNullable<
    ConstructorParameters<typeof DefaultChatTransport>[0]
  >['prepareSendMessagesRequest']
>;

/** Endpoint, credential scope and body must describe the same immutable send. */
export function createMiraRequestPreparer(
  resolveHeaders = getMiraTempAuthHeaders
): PrepareRequest {
  return async ({ id, messages, body, headers }) => {
    const snapshot = { ...body };
    const subscription =
      typeof snapshot.model === 'string' &&
      snapshot.model.startsWith('chatgpt/');
    const requestHeaders = new Headers(headers);
    // A stale per-send header must never override the selected request's identity.
    requestHeaders.delete(AI_TEMP_AUTH_HEADER);
    if (!subscription) {
      const authHeaders = await resolveHeaders({
        wsId: snapshot.wsId,
        creditWsId: snapshot.creditWsId,
        creditSource: snapshot.creditSource,
      });
      for (const [key, value] of Object.entries(authHeaders))
        requestHeaders.set(key, value);
    }
    return {
      api: subscription ? '/api/ai/chatgpt' : '/api/ai/chat',
      headers: requestHeaders,
      body: { ...snapshot, id, messages },
    };
  };
}
