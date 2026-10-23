import { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runProcessGroup } from './devbox-job-process';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: spawnMock,
}));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('late remote stop checks', () => {
  it('sends no signals when a pending stop resolves after normal exit', async () => {
    vi.useFakeTimers();
    const child = Object.assign(new ChildProcess(), {
      pid: 424242,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    spawnMock.mockReturnValue(child);
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
      // Simulate the exited group's disappearance without touching real PIDs.
      throw new Error('fixture: process no longer exists');
    });
    let finishCheck: (cancel: boolean) => void = () => {
      throw new Error('stop check was not started');
    };
    const pendingStop = new Promise<boolean>((resolve) => {
      finishCheck = resolve;
    });
    const checkCancel = vi.fn(() => pendingStop);
    const running = runProcessGroup({
      command: 'fixture',
      args: [],
      cwd: process.cwd(),
      env: {},
      checkCancel,
      cancelCheckMs: 10,
      graceMs: 20,
      onOutput: () => {},
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(checkCancel).toHaveBeenCalledTimes(1);

    child.emit('exit', 0, null);
    await expect(running).resolves.toEqual({
      code: 0,
      signal: null,
      cancelled: false,
      timedOut: false,
    });
    finishCheck(true);
    await vi.advanceTimersByTimeAsync(100);

    expect(kill).not.toHaveBeenCalled();
    expect(checkCancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
