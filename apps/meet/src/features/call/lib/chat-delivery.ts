import type { MeetSignaling } from './signaling';

/** Retries only chat transport failures, always with the same deduplication ID. */
export async function sendRecoverableChat(
  signaling: Pick<MeetSignaling, 'request' | 'isClosed'>,
  body: string,
  attachmentIds?: string[],
  wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
) {
  const message = {
    type: 'chat.message' as const,
    clientMessageId: crypto.randomUUID(),
    body,
    attachmentIds,
  };
  for (let attempt = 0; ; attempt++) {
    if (signaling.isClosed) throw new Error('signaling_closed');
    try {
      return await signaling.request<{ id: string }>(message);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !['signaling_closed', 'signaling_timeout'].includes(error.message) ||
        attempt >= 6
      )
        throw error;
      await wait(Math.min(1000 * 2 ** attempt, 5000));
    }
  }
}
