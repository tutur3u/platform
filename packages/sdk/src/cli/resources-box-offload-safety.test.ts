import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevboxFleetRunner } from '../devbox-fleet-types';
import { offloadRun } from './resources';
import * as box from './resources-box-offload';

const sha = 'a'.repeat(40);
const trusted = (
  overrides: Partial<DevboxFleetRunner> = {}
): DevboxFleetRunner => ({
  id: 'trusted-1',
  name: 'trusted-1',
  status: 'online',
  heartbeat_enabled: true,
  last_heartbeat_at: '2026-10-23T02:00:00.000Z',
  enabled_features: { run: true },
  resource_limits: null,
  capabilities: { executionMode: 'trusted', protocols: { commitRun: [1] } },
  drain_requested_at: null,
  ...overrides,
});

function client(
  overrides: Partial<Record<string, (...args: never[]) => unknown>> = {}
) {
  const devboxes = {
    createRun: vi.fn(async () => ({
      run: { id: 'run-1', status: 'queued', command: [], exitCode: null },
    })),
    getRun: vi.fn(async () => ({
      run: { id: 'run-1', status: 'succeeded', command: [], exitCode: 0 },
    })),
    getRunLogs: vi.fn(async () => ({ logs: [] as string[], next: 0 })),
    stopRun: vi.fn(async () => ({ message: 'stop requested' })),
    fleet: {
      snapshot: vi.fn(async () => ({
        server_time: '2026-10-23T02:00:05.000Z',
        runners: [trusted()],
        runs: [],
        leases: [],
      })),
    },
    ...overrides,
  };
  return { client: { devboxes } as never, devboxes };
}
const quiet = { write: () => {}, log: () => {}, pollMs: 1 };

describe('offload never repeats a created run locally (REV-6454-1)', () => {
  it('stops the remote run and exits non-zero when following it fails', async () => {
    const { client: c, devboxes } = client({
      getRun: vi.fn(async () => {
        throw new Error('control plane unavailable');
      }),
    });
    const code = await box.runBoxOffload({
      client: c,
      runnerId: 'trusted-1',
      sha,
      prefix: '',
      argv: ['true'],
      timeoutSeconds: 60,
      ...quiet,
    });
    expect(code).toBe(1);
    expect(devboxes.stopRun).toHaveBeenCalledWith('run-1', {
      signal: expect.any(AbortSignal),
    });
  });

  it('classifies creation failures as rejected (4xx) or ambiguous', async () => {
    for (const [error, rejected] of [
      [Object.assign(new Error('bad request'), { status: 400 }), true],
      [Object.assign(new Error('bad gateway'), { status: 502 }), false],
      [new Error('socket hang up'), false],
    ] as const) {
      const { client: c } = client({
        createRun: vi.fn(async () => {
          throw error;
        }),
      });
      const result = box.runBoxOffload({
        client: c,
        runnerId: 'trusted-1',
        sha,
        prefix: '',
        argv: ['true'],
        timeoutSeconds: 60,
        ...quiet,
      });
      await expect(result).rejects.toBeInstanceOf(box.OffloadNotCreatedError);
      await expect(result).rejects.toMatchObject({ rejected });
    }
  });

  const run = (target: string, devboxes: ReturnType<typeof client>['client']) =>
    offloadRun({
      home: '/unused',
      lanes: 1,
      target,
      argv: ['true'],
      queueStatus: (async () => ({
        occupied: 1,
        effectiveLanes: 1,
        waiting: [],
      })) as never,
      loadBox: async () => ({
        ...box,
        offloadCommitPlan: () => ({ sha, prefix: '' }),
        createSessionClient: async () => devboxes,
        selectOffloadRunner: (snapshot, requested) =>
          box.selectOffloadRunner(snapshot, requested),
        runBoxOffload: (options) => box.runBoxOffload({ ...options, ...quiet }),
      }),
    });

  it.each(['auto', 'trusted-1'])(
    '%s: returns the stopped run code instead of falling back',
    async (target) => {
      const { client: c, devboxes } = client({
        getRun: vi.fn(async () => {
          throw new Error('lost');
        }),
      });
      const log = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      try {
        await expect(run(target, c)).resolves.toBe(1);
      } finally {
        log.mockRestore();
      }
      expect(devboxes.createRun).toHaveBeenCalledTimes(1);
      expect(devboxes.stopRun).toHaveBeenCalledWith('run-1', {
        signal: expect.any(AbortSignal),
      });
    }
  );

  it('auto: falls back only when the server rejected the run', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const rejected = client({
        createRun: vi.fn(async () => {
          throw Object.assign(new Error('forbidden'), { status: 403 });
        }),
      });
      await expect(run('auto', rejected.client)).resolves.toBeUndefined();
      const ambiguous = client({
        createRun: vi.fn(async () => {
          throw new Error('socket hang up');
        }),
      });
      await expect(run('auto', ambiguous.client)).resolves.toBe(1);
      // Explicit mode never falls back.
      await expect(run('trusted-1', rejected.client)).rejects.toThrow(
        'not created'
      );
    } finally {
      stderr.mockRestore();
    }
  });
});

describe('offload follow-through (REV-6454-4)', () => {
  it('stops a run whose creation was interrupted', async () => {
    const on = vi.spyOn(process, 'on');
    const { client: c, devboxes } = client({
      createRun: vi.fn(async () => {
        const handler = on.mock.calls.find(
          ([signal]) => signal === 'SIGINT'
        )?.[1] as (() => void) | undefined;
        handler?.();
        return {
          run: { id: 'run-1', status: 'queued', command: [], exitCode: null },
        };
      }),
    });
    try {
      const code = await box.runBoxOffload({
        client: c,
        runnerId: 'trusted-1',
        sha,
        prefix: '',
        argv: ['true'],
        timeoutSeconds: 60,
        ...quiet,
      });
      expect(code).toBe(130);
      expect(devboxes.stopRun).toHaveBeenCalledWith('run-1', {
        signal: expect.any(AbortSignal),
      });
    } finally {
      on.mockRestore();
    }
  });

  it('pages logs forward and prints every line exactly once', async () => {
    const lines = Array.from({ length: 2500 }, (_, index) => `line ${index}`);
    const offsets: number[] = [];
    let polls = 0;
    const { client: c } = client({
      getRunLogs: vi.fn(async (_id: string, options?: { offset?: number }) => {
        const offset = options?.offset ?? 0;
        offsets.push(offset);
        const available = polls === 0 ? 1500 : lines.length;
        const page = lines.slice(offset, Math.min(available, offset + 1000));
        return { logs: page, next: offset + page.length };
      }),
      getRun: vi.fn(async () => {
        polls += 1;
        return {
          run: { id: 'run-1', status: 'succeeded', command: [], exitCode: 0 },
        };
      }),
    });
    const written: string[] = [];
    const code = await box.runBoxOffload({
      client: c,
      runnerId: 'trusted-1',
      sha,
      prefix: '',
      argv: ['true'],
      timeoutSeconds: 60,
      ...quiet,
      write: (text) => written.push(text),
    });
    expect(code).toBe(0);
    expect(written.join('')).toBe(lines.map((line) => `${line}\n`).join(''));
    expect(offsets).toEqual([0, 1000, 1500, 2500]);
  });
});

describe('runner selection (REV-6454-2, REV-6454-3)', () => {
  it('judges heartbeat freshness by the server clock, not the local one', () => {
    const snapshot = {
      runners: [trusted()],
      runs: [],
      leases: [],
    };
    // The local clock is far behind; the server says the heartbeat is stale.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.parse('2026-10-23T02:00:10.000Z'));
      expect(
        box.selectOffloadRunner(
          { ...snapshot, server_time: '2026-10-23T03:00:00.000Z' },
          'auto'
        )
      ).toMatchObject({ blockedBy: 'stale_heartbeat' });
      // A local clock far ahead does not make a fresh runner look stale.
      vi.setSystemTime(Date.parse('2026-10-23T05:00:00.000Z'));
      expect(
        box.selectOffloadRunner(
          { ...snapshot, server_time: '2026-10-23T02:00:05.000Z' },
          'auto'
        )
      ).toHaveProperty('runner');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ranks actionable blockers ahead of the trust cap', () => {
    expect(
      box.selectOffloadRunner(
        {
          server_time: '2026-10-23T02:00:05.000Z',
          runners: [
            trusted({
              id: 'judge',
              capabilities: { executionMode: 'judge-only' },
            }),
            trusted({
              id: 'stale',
              last_heartbeat_at: '2026-10-05T08:00:00.000Z',
            }),
          ],
          runs: [],
          leases: [],
        },
        'auto'
      )
    ).toMatchObject({ blockedBy: 'stale_heartbeat' });
  });
});

describe('origin-only commits (REV-6454-4)', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      },
    }).trim();

  it('refuses a commit that only another remote contains', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'ttr-origin-')));
    dirs.push(root);
    for (const name of ['o.git', 'fork.git'])
      git(root, 'init', '--bare', '--quiet', '-b', 'main', join(root, name));
    const local = join(root, 'local');
    git(root, 'clone', '--quiet', join(root, 'o.git'), local);
    git(local, 'remote', 'add', 'fork', join(root, 'fork.git'));
    await writeFile(join(local, 'v.txt'), 'one\n');
    git(local, 'add', '.');
    git(local, 'commit', '--quiet', '-m', 'one');
    git(local, 'push', '--quiet', 'fork', 'HEAD:main');
    git(local, 'fetch', '--quiet', 'fork');
    expect(() => box.offloadCommitPlan(local)).toThrow('origin/*');
    git(local, 'push', '--quiet', 'origin', 'HEAD:main');
    git(local, 'fetch', '--quiet', 'origin');
    expect(box.offloadCommitPlan(local).sha).toBe(
      git(local, 'rev-parse', 'HEAD')
    );
  });
});
