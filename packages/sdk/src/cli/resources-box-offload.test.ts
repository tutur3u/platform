import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type DevboxFleetRunner,
  type DevboxFleetSnapshot,
  evaluateTrustedRunner,
} from '../devbox-fleet-types';
import {
  commitRunCommand,
  offloadCommitPlan,
  runBoxOffload,
  selectOffloadRunner,
} from './resources-box-offload';

const now = Date.parse('2026-10-23T02:00:00.000Z');
const fresh = new Date(now - 5_000).toISOString();
function runner(
  id: string,
  overrides: Partial<DevboxFleetRunner> = {}
): DevboxFleetRunner {
  return {
    id,
    name: id,
    status: 'online',
    heartbeat_enabled: true,
    last_heartbeat_at: fresh,
    enabled_features: { run: true, build: true, judge: false },
    resource_limits: null,
    capabilities: { executionMode: 'trusted', protocols: { commitRun: [1] } },
    drain_requested_at: null,
    activity: { queued_runs: 0, running_runs: 0, active_leases: 0 },
    ...overrides,
  };
}
const fleet = {
  judgeOnly: runner('judge-1', {
    enabled_features: { run: false, build: false, judge: true },
    capabilities: { executionMode: 'judge-only' },
  }),
  // Oct 5: list status still says online, heartbeat is weeks old.
  stale: runner('stale-1', { last_heartbeat_at: '2026-10-05T08:00:00.000Z' }),
  offline: runner('offline-1', { status: 'registered' }),
  draining: runner('drain-1', { drain_requested_at: fresh }),
  noRun: runner('norun-1', { enabled_features: { run: false } }),
  unattested: runner('legacy-1', { capabilities: {} }),
  // Trusted but built without the commit-run decoder (#6452).
  noProtocol: runner('noproto-1', {
    capabilities: { executionMode: 'trusted' },
  }),
  futureProtocol: runner('future-1', {
    capabilities: { executionMode: 'trusted', protocols: { commitRun: [2] } },
  }),
  trusted: runner('trusted-1'),
  busyTrusted: runner('trusted-2', {
    activity: { queued_runs: 1, running_runs: 2, active_leases: 1 },
  }),
};
const snapshot = (runners: DevboxFleetRunner[]): DevboxFleetSnapshot => ({
  runners,
  runs: [],
  leases: [],
});

describe('trusted runner eligibility', () => {
  it.each([
    ['judgeOnly', 'trust_cap'],
    ['stale', 'stale_heartbeat'],
    ['offline', 'offline'],
    ['draining', 'draining'],
    ['noRun', 'capability_missing'],
    ['unattested', 'trust_cap'],
    ['noProtocol', 'capability_missing'],
    ['futureProtocol', 'capability_missing'],
  ] as const)('%s is blocked by %s', (key, blocker) => {
    expect(evaluateTrustedRunner(fleet[key], now)).toMatchObject({
      eligible: false,
      blockedBy: blocker,
    });
  });

  it('accepts a fresh attested trusted-development runner', () => {
    expect(evaluateTrustedRunner(fleet.trusted, now)).toMatchObject({
      eligible: true,
    });
  });

  it('picks the least busy eligible runner and never a Judge runner', () => {
    const selection = selectOffloadRunner(
      snapshot([
        fleet.judgeOnly,
        fleet.busyTrusted,
        fleet.stale,
        fleet.trusted,
      ]),
      'auto',
      now
    );
    expect('runner' in selection && selection.runner.id).toBe('trusted-1');
    expect(
      selectOffloadRunner(snapshot([fleet.judgeOnly]), 'judge-1', now)
    ).toMatchObject({ blockedBy: 'trust_cap' });
  });

  it('explains the closest blocker when nothing is eligible', () => {
    expect(
      selectOffloadRunner(snapshot([fleet.offline, fleet.stale]), 'auto', now)
    ).toMatchObject({ blockedBy: 'stale_heartbeat' });
    expect(
      selectOffloadRunner(snapshot([fleet.trusted]), 'missing-id', now)
    ).toMatchObject({ blockedBy: 'no_eligible_runner' });
    expect(selectOffloadRunner(snapshot([]), 'auto', now)).toMatchObject({
      blockedBy: 'no_eligible_runner',
    });
  });
});

describe('streamed box offload', () => {
  function fakeClient(states: { status: string; exitCode?: number | null }[]) {
    let polls = 0;
    const logs = ['remote$ checkout abc', 'one', 'two', 'three'];
    const devboxes = {
      createRun: vi.fn(async () => ({
        run: { id: 'run-1', status: 'queued', command: [], exitCode: null },
      })),
      getRun: vi.fn(async () => {
        const state = states[Math.min(polls, states.length - 1)]!;
        polls += 1;
        return { run: { id: 'run-1', command: [], ...state } };
      }),
      getRunLogs: vi.fn(async () => ({
        logs: logs.slice(0, Math.min(logs.length, 1 + polls)),
      })),
      stopRun: vi.fn(async () => ({ message: 'stop requested' })),
    };
    return { client: { devboxes } as never, devboxes };
  }

  it('pins the runner, sends only the commit envelope, streams logs and keeps the exit code', async () => {
    const { client, devboxes } = fakeClient([
      { status: 'running' },
      { status: 'running' },
      { status: 'failed', exitCode: 7 },
    ]);
    const written: string[] = [];
    const code = await runBoxOffload({
      client,
      runnerId: 'trusted-1',
      sha: 'a'.repeat(40),
      prefix: 'packages/sdk/',
      argv: ['node', '--test', 'x.test.js'],
      timeoutSeconds: 60,
      write: (text) => written.push(text),
      log: () => {},
      pollMs: 1,
    });
    expect(code).toBe(7);
    const payload = devboxes.createRun.mock.calls[0]![0] as {
      command: string[];
      env?: unknown;
      runnerId: string;
    };
    expect(payload.runnerId).toBe('trusted-1');
    expect(payload).not.toHaveProperty('env');
    expect(payload.command[0]).toBe('__ttr_commit_run_v1__');
    expect(
      JSON.parse(Buffer.from(payload.command[1]!, 'base64url').toString())
    ).toEqual({
      v: 1,
      sha: 'a'.repeat(40),
      prefix: 'packages/sdk',
      command: ['node', '--test', 'x.test.js'],
    });
    // Each log line printed exactly once, in order.
    expect(written.join('')).toBe('remote$ checkout abc\none\ntwo\nthree\n');
  });

  it('requests a remote stop and exits 124 when the bound expires', async () => {
    const { client, devboxes } = fakeClient([{ status: 'running' }]);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const run = runBoxOffload({
        client,
        runnerId: 'trusted-1',
        sha: 'b'.repeat(40),
        prefix: '',
        argv: ['true'],
        timeoutSeconds: 1,
        write: () => {},
        log: () => {},
        pollMs: 1,
      });
      vi.setSystemTime(Date.now() + 120_000);
      expect(await run).toBe(124);
      expect(devboxes.stopRun).toHaveBeenCalledWith('run-1', {
        signal: expect.any(AbortSignal),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('matches the runner decoder wire format', () => {
    const [envelope, payload] = commitRunCommand('c'.repeat(40), 'a/b/', [
      'ls',
    ]);
    expect(envelope).toBe('__ttr_commit_run_v1__');
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toEqual({
      v: 1,
      sha: 'c'.repeat(40),
      prefix: 'a/b',
      command: ['ls'],
    });
  });
});

describe('exact commit planning', () => {
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

  it('refuses dirty or unpushed trees and records the subdirectory', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'ttr-plan-')));
    dirs.push(root);
    git(root, 'init', '--bare', '--quiet', '-b', 'main', join(root, 'o.git'));
    const local = join(root, 'local');
    git(root, 'clone', '--quiet', join(root, 'o.git'), local);
    await mkdir(join(local, 'pkg'));
    await writeFile(join(local, 'pkg', 'v.txt'), 'one\n');
    git(local, 'add', '.');
    git(local, 'commit', '--quiet', '-m', 'one');
    git(local, 'push', '--quiet', 'origin', 'HEAD:main');
    expect(offloadCommitPlan(join(local, 'pkg'))).toEqual({
      sha: git(local, 'rev-parse', 'HEAD'),
      prefix: 'pkg/',
    });
    await writeFile(join(local, 'pkg', 'v.txt'), 'dirty\n');
    expect(() => offloadCommitPlan(local)).toThrow('dirty tree');
    git(local, 'commit', '--quiet', '-am', 'unpushed');
    expect(() => offloadCommitPlan(local)).toThrow('pushed commit');
  });
});
