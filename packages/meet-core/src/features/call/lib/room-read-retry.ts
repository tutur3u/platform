/**
 * The ended screen reads the room while it is still being torn down, so a
 * server error or a dropped request is retried a couple of times. A refusal
 * (401, 403, 404, 409) is an answer and stays final.
 */
export function retryRoomRead(failures: number, error: unknown) {
  if (failures >= 3) return false;
  const status = (error as { status?: unknown } | null)?.status;
  // A dropped request surfaces as a TypeError from fetch.
  return typeof status === 'number'
    ? status >= 500
    : error instanceof TypeError;
}

export const roomReadRetryDelay = (attempt: number) =>
  Math.min(1000 * 2 ** attempt, 4000);
