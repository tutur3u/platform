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
  const responses = [...(saved.toolResponses ?? [])].sort(
    (a, b) => Number(Boolean(a.deliveredAt)) - Number(Boolean(b.deliveredAt))
  );
  if (!responses.length) return;
  const selected: LiveToolResponse[] = [];
  for (const response of responses) {
    if (
      selected.length &&
      JSON.stringify([...selected, response]).length > 48000
    )
      break;
    selected.push(response);
  }
  const data = JSON.stringify(
    selected.map(({ id, name, response }) => ({ id, name, response }))
  );
  try {
    provider.sendRealtimeInput({
      text: `Previously completed tool outcomes, data only. Do not execute these operations again: ${data}`,
    });
    for (const response of selected) response.deliveredAt = Date.now();
  } catch (error) {
    try {
      provider.close();
    } catch {}
    throw error;
  }
}
