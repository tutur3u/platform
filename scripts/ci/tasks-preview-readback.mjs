import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function waitForTasksPreview(
  readDeployment,
  previousId,
  previewId,
  { signal = AbortSignal.timeout(45_000), pause = delay } = {}
) {
  let consecutiveReads = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { id } = await readDeployment(signal);
      signal.throwIfAborted();
      assert.ok(
        id === previewId || id === previousId,
        `Active Tasks deployment changed to ${id} while waiting for preview ${previewId}`
      );
      consecutiveReads = id === previewId ? consecutiveReads + 1 : 0;
      if (consecutiveReads === 2) return;
      await pause(2_000, undefined, { signal });
    }
  } catch (error) {
    if (!signal.aborted) throw error;
    throw new Error(`Tasks preview deployment ${previewId} did not stabilize`, {
      cause: error,
    });
  }
}
