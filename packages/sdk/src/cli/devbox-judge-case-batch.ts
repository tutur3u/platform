import { withSandboxSlot } from './devbox-sandbox-slots';

/** Infrastructure failure cancels waiting cases. Already admitted cases retain
 * their resource reservation until their command and cleanup both finish. */
export async function runJudgeCaseBatch<T>(
  count: number,
  parallelLimit: number,
  run: (index: number) => Promise<T>
): Promise<T[]> {
  const controller = new AbortController();
  const settled = await Promise.allSettled(
    Array.from({ length: count }, (_, index) =>
      withSandboxSlot(
        parallelLimit,
        async () => {
          try {
            return await run(index);
          } catch (error) {
            controller.abort(error);
            throw error;
          }
        },
        controller.signal
      )
    )
  );
  if (controller.signal.aborted) throw controller.signal.reason;
  return settled.map((result) => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}
