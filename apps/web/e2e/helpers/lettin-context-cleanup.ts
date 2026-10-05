import type { BrowserContext } from '@playwright/test';
import { safeLettinPhaseFailure } from './lettin-phase-diagnostics';

export async function withLettinContextCleanup<T>(
  context: BrowserContext,
  action: () => Promise<T>,
  kind: 'import' | 'Markdown' = 'import'
): Promise<T> {
  const outcome = await action().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error })
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    console.info(`[lettin-e2e] close ${kind} context: started`);
    await Promise.race([
      context.close(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Context cleanup deadline exceeded')),
          10_000
        );
      }),
    ]);
    console.info(`[lettin-e2e] close ${kind} context: completed`);
  } catch (error) {
    console.warn(
      `[lettin-e2e] close ${kind} context: failed`,
      safeLettinPhaseFailure(error)
    );
    if (outcome.ok) throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
