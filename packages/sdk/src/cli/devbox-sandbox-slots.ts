/** Process-wide budget, shared by simultaneous Judge jobs. Each slot owns one
 * fresh container; no test reuses another test's filesystem or process state. */
let active = 0;
const waiting: { limit: number; start: () => void }[] = [];
function drain() {
  while (waiting.length && active < waiting[0]!.limit) {
    active++;
    waiting.shift()!.start();
  }
}
export async function withSandboxSlot<T>(
  limit: number,
  run: () => Promise<T>
): Promise<T> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 16)
    throw new Error('Invalid sandbox concurrency');
  await new Promise<void>((start) => {
    waiting.push({ limit, start });
    drain();
  });
  try {
    return await run();
  } finally {
    active--;
    drain();
  }
}
