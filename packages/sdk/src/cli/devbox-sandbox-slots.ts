/** Each case reserves its share of one host budget, including across jobs with
 * different parallel limits. Scan eligible waiters instead of blocking on a
 * larger reservation at the head. Never reuse a case's container. */
let reserved = 0;
let active = 0;
interface Reservation {
  weight: number;
  start: () => void;
  signal?: AbortSignal;
  cancel: () => void;
}
const waiting: Reservation[] = [];
function drain() {
  for (let index = 0; index < waiting.length; ) {
    const entry = waiting[index]!;
    if (reserved + entry.weight > 1 + Number.EPSILON) {
      index++;
      continue;
    }
    waiting.splice(index, 1);
    entry.signal?.removeEventListener('abort', entry.cancel);
    reserved += entry.weight;
    active++;
    entry.start();
  }
}
export async function withSandboxSlot<T>(
  limit: number,
  run: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 16)
    throw new Error('Invalid sandbox concurrency');
  signal?.throwIfAborted();
  const weight = 1 / limit;
  await new Promise<void>((start, reject) => {
    const entry: Reservation = {
      weight,
      start,
      signal,
      cancel: () => {
        const index = waiting.indexOf(entry);
        if (index !== -1) waiting.splice(index, 1);
        reject(signal?.reason);
        drain();
      },
    };
    waiting.push(entry);
    signal?.addEventListener('abort', entry.cancel, { once: true });
    drain();
  });
  try {
    signal?.throwIfAborted();
    return await run();
  } finally {
    active--;
    reserved = active ? Math.max(0, reserved - weight) : 0;
    drain();
  }
}
