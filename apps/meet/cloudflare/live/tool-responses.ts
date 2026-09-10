import type { Session } from '@google/genai/web';
import type { SavedSession } from './session-state';

export type LiveToolResponse = {
  id: string;
  name: string;
  response: Record<string, unknown>;
  deliveredAt?: number;
};
/** Persist outcomes before transport. Reconnection never reruns the approved operation. */
export async function queueLiveToolResponse(
  saved: SavedSession,
  provider: Session | undefined,
  response: LiveToolResponse,
  persist: () => Promise<void>
) {
  saved.toolResponses = [
    ...(saved.toolResponses ?? []).filter((item) => item.id !== response.id),
    response,
  ];
  await persist();
  if (!provider) return;
  try {
    provider.sendToolResponse({ functionResponses: [response] });
    response.deliveredAt = Date.now();
  } catch {
    /* The next fresh provider receives the saved outcome. */
  }
  await persist();
}
/** A fresh session receives results as data, not old function-call IDs or executable requests. */
export function replayLiveToolResponses(
  saved: SavedSession,
  provider: Session
) {
  const responses = saved.toolResponses ?? [];
  if (!responses.length) return;
  provider.sendRealtimeInput({
    text: `Previously completed tool outcomes (data only). Tell the user the result; do not execute these operations again: ${JSON.stringify(responses.map(({ id, name, response }) => ({ id, name, response }))).slice(0, 48000)}`,
  });
  for (const response of responses) response.deliveredAt = Date.now();
}
