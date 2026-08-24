import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginTaskTerminalIntent,
  enqueueTaskTerminalMutation,
  finishTaskTerminalIntent,
  hasPendingTaskTerminalIntent,
  isLatestTaskTerminalIntent,
  resetTaskTerminalMutationQueueForTests,
} from '../task-terminal-mutation-queue';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => resetTaskTerminalMutationQueueForTests());

describe('task terminal mutation queue', () => {
  it('runs terminal persistence in intent order while exposing the latest intent', async () => {
    const first = createDeferred();
    const calls: string[] = [];
    const firstIntent = beginTaskTerminalIntent('task-1');
    const firstMutation = enqueueTaskTerminalMutation('task-1', async () => {
      calls.push('done:start');
      await first.promise;
      calls.push('done:end');
    });

    const secondIntent = beginTaskTerminalIntent('task-1');
    const secondOperation = vi.fn(async () => {
      calls.push('closed');
    });
    const secondMutation = enqueueTaskTerminalMutation(
      'task-1',
      secondOperation
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['done:start']);
    expect(secondOperation).not.toHaveBeenCalled();
    expect(isLatestTaskTerminalIntent('task-1', firstIntent)).toBe(false);
    expect(isLatestTaskTerminalIntent('task-1', secondIntent)).toBe(true);
    expect(hasPendingTaskTerminalIntent('task-1')).toBe(true);

    first.resolve();
    await firstMutation;
    finishTaskTerminalIntent('task-1', firstIntent);
    await secondMutation;
    finishTaskTerminalIntent('task-1', secondIntent);

    expect(calls).toEqual(['done:start', 'done:end', 'closed']);
    expect(hasPendingTaskTerminalIntent('task-1')).toBe(false);
  });

  it('continues with the latest intent after an earlier persistence failure', async () => {
    const latestMutation = vi.fn().mockResolvedValue(undefined);
    const first = enqueueTaskTerminalMutation('task-1', async () => {
      throw new Error('done failed');
    });
    const latest = enqueueTaskTerminalMutation('task-1', latestMutation);

    await expect(first).rejects.toThrow('done failed');
    await expect(latest).resolves.toBeUndefined();
    expect(latestMutation).toHaveBeenCalledTimes(1);
  });
});
