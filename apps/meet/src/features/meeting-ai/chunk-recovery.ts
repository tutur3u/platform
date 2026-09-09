/** Retry the same chunk identity so lost responses cannot create duplicate charges. */
export async function recoverMeetChunk<T extends { status: string }>(
  upload: (signal: AbortSignal) => Promise<T>,
  options: {
    deadline: number;
    onRetry: () => void;
    now?: () => number;
    wait?: (milliseconds: number) => Promise<void>;
  }
): Promise<T> {
  const now = options.now ?? Date.now;
  const wait =
    options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let attempt = 0;
  while (true) {
    const remaining = options.deadline - now();
    if (remaining <= 0) throw new Error('Transcription recovery timed out');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(45_000, remaining)
    );
    try {
      const result = await upload(controller.signal);
      if (result.status === 'completed') return result;
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number(error.status)
          : 0;
      // Authorization, invalid audio, and ended sessions require user action.
      if ([400, 401, 403, 404, 409, 413].includes(status)) throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (now() >= options.deadline)
      throw new Error('Transcription recovery timed out');
    options.onRetry();
    await wait(
      Math.min(
        1000 * 2 ** Math.min(attempt++, 4),
        15_000,
        options.deadline - now()
      )
    );
  }
}
