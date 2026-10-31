import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchRequestOpenTask,
  dispatchTaskOpenResult,
  REQUEST_OPEN_TASK_EVENT,
  type RequestOpenTaskPayload,
  TASK_OPEN_RESULT_EVENT,
  type TaskOpenResultPayload,
  waitForTaskOpenResult,
} from '../task-open-events';

describe('dispatchRequestOpenTask', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches the request event with a forced handled=false detail', () => {
    const listener = vi.fn();
    window.addEventListener(REQUEST_OPEN_TASK_EVENT, listener);

    const result = dispatchRequestOpenTask({
      taskId: 'task-1',
      wsId: 'ws-1',
      requestId: 'req-1',
      handled: true,
    });

    window.removeEventListener(REQUEST_OPEN_TASK_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock
      .calls[0]?.[0] as CustomEvent<RequestOpenTaskPayload>;
    expect(event.detail).toEqual({
      taskId: 'task-1',
      wsId: 'ws-1',
      requestId: 'req-1',
      handled: false,
    });
    expect(result).toEqual({ handled: false, requestId: 'req-1' });
  });

  it('reports handled=true when a listener marks the detail handled', () => {
    const listener = (event: Event) => {
      (event as CustomEvent<RequestOpenTaskPayload>).detail.handled = true;
    };
    window.addEventListener(REQUEST_OPEN_TASK_EVENT, listener);

    const result = dispatchRequestOpenTask({
      taskId: 'task-2',
      requestId: 'req-2',
    });

    window.removeEventListener(REQUEST_OPEN_TASK_EVENT, listener);

    expect(result).toEqual({ handled: true, requestId: 'req-2' });
  });

  it('generates a request id with crypto.randomUUID when none is given', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000000'
    );

    const result = dispatchRequestOpenTask({ taskId: 'task-3' });

    expect(result.requestId).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('falls back to a time-based id when crypto.randomUUID is missing', () => {
    vi.stubGlobal('crypto', {});
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    try {
      const result = dispatchRequestOpenTask({ taskId: 'task-4' });
      expect(result.requestId).toBe('1234-0.5');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('dispatchTaskOpenResult', () => {
  it('dispatches the result event with the payload as detail', () => {
    const listener = vi.fn();
    window.addEventListener(TASK_OPEN_RESULT_EVENT, listener);

    dispatchTaskOpenResult({ requestId: 'req-5', opened: true });

    window.removeEventListener(TASK_OPEN_RESULT_EVENT, listener);

    const event = listener.mock
      .calls[0]?.[0] as CustomEvent<TaskOpenResultPayload>;
    expect(event.detail).toEqual({ requestId: 'req-5', opened: true });
  });
});

describe('waitForTaskOpenResult', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves false immediately for an empty request id', async () => {
    await expect(waitForTaskOpenResult('')).resolves.toBe(false);
  });

  it('resolves with the opened flag of the matching result only', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const pending = waitForTaskOpenResult('req-6');

    dispatchTaskOpenResult({ requestId: 'other', opened: true });
    dispatchTaskOpenResult({ requestId: 'req-6', opened: false });

    await expect(pending).resolves.toBe(false);
    expect(removeSpy).toHaveBeenCalledWith(
      TASK_OPEN_RESULT_EVENT,
      expect.any(Function)
    );
  });

  it('resolves true when the matching result reports opened', async () => {
    const pending = waitForTaskOpenResult('req-7');

    dispatchTaskOpenResult({ requestId: 'req-7', opened: true });

    await expect(pending).resolves.toBe(true);
  });

  it('resolves false after the timeout and ignores later results', async () => {
    vi.useFakeTimers();
    const pending = waitForTaskOpenResult('req-8', 100);

    vi.advanceTimersByTime(99);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    vi.advanceTimersByTime(1);
    await expect(pending).resolves.toBe(false);

    // A late result must not throw or re-resolve.
    dispatchTaskOpenResult({ requestId: 'req-8', opened: true });
  });
});
