import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  processGroupExists,
  runProcessGroup,
  signalProcessGroup,
} from './devbox-job-process';
import { executeDevboxAgentJob } from './devbox-runner';

const env = { PATH: process.env.PATH ?? '/usr/bin:/bin' };
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
// The fixture shell prints each background descendant's PID.
async function run(script: string, extra: object) {
  const pids: number[] = [];
  const result = await runProcessGroup({
    command: 'sh',
    args: ['-c', script],
    cwd: process.cwd(),
    env,
    graceMs: 300,
    onOutput: (chunk) =>
      pids.push(...chunk.split(/\s+/).filter(Boolean).map(Number)),
    ...extra,
  });
  return { result, pids };
}
const leaked: number[] = [];
afterEach(() => {
  for (const pid of leaked.splice(0))
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* Already gone. */
    }
});

describe('job process groups', { timeout: 15_000 }, () => {
  it.each([
    '',
    'echo;id',
    'echo|id',
    '$(id)',
    '`id`',
    'echo>file',
    'echo\nwhoami',
    'echo\0',
  ])('rejects malformed executable %j before spawning', async (command) => {
    await expect(
      runProcessGroup({
        command,
        args: [],
        cwd: process.cwd(),
        env,
        onOutput: () => {},
      })
    ).rejects.toThrow('Invalid devbox executable or argument.');
  });

  it('preserves shell syntax as literal argv data', async () => {
    const argument = '; echo injected | $(whoami) `id` > file';
    let output = '';
    const result = await runProcessGroup({
      command: process.execPath,
      args: ['-e', 'process.stdout.write(process.argv[1])', argument],
      cwd: process.cwd(),
      env,
      onOutput: (chunk) => {
        output += chunk;
      },
    });
    expect(result.code).toBe(0);
    expect(output).toBe(argument);
  });

  it('rejects NUL arguments before spawning', async () => {
    await expect(
      runProcessGroup({
        command: process.execPath,
        args: ['bad\0argument'],
        cwd: process.cwd(),
        env,
        onOutput: () => {},
      })
    ).rejects.toThrow('Invalid devbox executable or argument.');
  });

  it('times out the whole group, not only the direct child', async () => {
    const { result, pids } = await run(
      'sleep 30 & echo $!; sleep 30 & echo $!; wait',
      { timeoutMs: 300 }
    );
    leaked.push(...pids);
    expect(result.timedOut).toBe(true);
    expect(pids).toHaveLength(2);
    for (const pid of pids) expect(alive(pid)).toBe(false);
  });

  it('SIGKILLs descendants that ignore SIGTERM after the grace period', async () => {
    const started = Date.now();
    const { result, pids } = await run(
      "trap '' TERM; sleep 30 & echo $!; wait; wait",
      { timeoutMs: 200 }
    );
    leaked.push(...pids);
    expect(result.timedOut).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    for (const pid of pids) expect(alive(pid)).toBe(false);
  });

  it('cancels on a remote stop check and on an abort signal', async () => {
    let checks = 0;
    const remote = await run('sleep 30 & echo $!; wait', {
      cancelCheckMs: 50,
      checkCancel: async () => ++checks >= 2,
    });
    leaked.push(...remote.pids);
    expect(remote.result).toMatchObject({ cancelled: true, timedOut: false });
    for (const pid of remote.pids) expect(alive(pid)).toBe(false);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const local = await run('sleep 30 & echo $!; wait', {
      cancelSignal: controller.signal,
    });
    leaked.push(...local.pids);
    expect(local.result.cancelled).toBe(true);
  });

  it('leaves normal exits untouched and propagates the code', async () => {
    const { result } = await run('exit 7', { timeoutMs: 5000 });
    expect(result).toMatchObject({
      code: 7,
      timedOut: false,
      cancelled: false,
    });
  });
});

describe('remote stop through the runner', { timeout: 15_000 }, () => {
  it('stops the job group and completes the run as cancelled', async () => {
    const bodies: { events?: unknown[]; completion?: unknown }[] = [];
    const fetch = vi.fn(async (_url: URL | string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const statusOnly = !body.events && !body.completion;
      return new Response(
        JSON.stringify({ cancelRequested: statusOnly && bodies.length > 2 }),
        { status: 200 }
      );
    });
    const result = await executeDevboxAgentJob(
      {
        command: ['sh', '-c', 'sleep 30 & wait'],
        leaseId: 'lease-1',
        runId: 'run-1',
      },
      {
        baseUrl: 'https://example.test',
        cancelCheckMs: 50,
        env: { ...env, TUTURUUU_DEVBOX_EXECUTION_MODE: 'trusted' },
        fetch: fetch as typeof globalThis.fetch,
        killGraceMs: 300,
        token: 'fixture',
      }
    );
    expect(result).toEqual({ exitCode: 143, status: 'cancelled' });
    expect(bodies.at(-1)).toMatchObject({
      completion: { exitCode: 143, status: 'cancelled' },
    });
  });
});

it('reports a missing group as gone', () => {
  expect(processGroupExists(2 ** 22 - 3)).toBe(false);
});

it('never signals a bare pid once its process group is gone', () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('gone'), { code: 'ESRCH' });
  });
  try {
    expect(signalProcessGroup(4242, 'SIGKILL')).toBe(false);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGKILL');
  } finally {
    kill.mockRestore();
  }
});
