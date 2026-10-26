export interface Deadline {
  deadline: number;
  now: () => number;
  signal?: AbortSignal;
  expired?: boolean;
}

// RPC calls cannot be aborted remotely. Stop awaiting them at the deadline and
// never start a dependent operation; a late write retains its idempotent identity.
export async function withinDeadline<T>(
  clock: Deadline,
  operation: () => Promise<T>
): Promise<T> {
  const remaining = clock.deadline - clock.now();
  if (remaining <= 0 || clock.signal?.aborted || clock.expired)
    throw new DOMException('Run deadline', 'TimeoutError');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () =>
    rejectAbort?.(new DOMException('Run deadline', 'TimeoutError'));
  let rejectAbort: ((reason: unknown) => void) | undefined;
  try {
    const value = await Promise.race([
      new Promise<never>((_resolve, reject) => {
        rejectAbort = reject;
        clock.signal?.addEventListener('abort', abort, { once: true });
      }),
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          clock.expired = true;
          reject(new DOMException('Run deadline', 'TimeoutError'));
        }, remaining);
      }),
    ]);
    if (clock.now() >= clock.deadline || clock.signal?.aborted)
      throw new DOMException('Run deadline', 'TimeoutError');
    return value;
  } finally {
    clearTimeout(timer);
    clock.signal?.removeEventListener('abort', abort);
  }
}
