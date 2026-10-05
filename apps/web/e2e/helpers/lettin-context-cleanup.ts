import type { BrowserContext } from '@playwright/test';
import { safeLettinPhaseFailure } from './lettin-phase-diagnostics';

export async function withLettinContextCleanup<T>(
  context: BrowserContext,
  action: () => Promise<T>
): Promise<T> {
  const outcome = await action().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error })
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      context.close(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Context cleanup deadline exceeded')),
          10_000
        );
      }),
    ]);
  } catch (error) {
    console.warn(
      '[lettin-e2e] close import context: failed',
      safeLettinPhaseFailure(error)
    );
    if (outcome.ok) throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
