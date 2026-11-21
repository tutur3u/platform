import { describe, expect, it } from 'vitest';
import type {
  DevboxAdminRun,
  DevboxAdminRunner,
  DevboxControlSnapshot,
} from '@/lib/devboxes/admin-store';
import { buildFleetView } from './fleet-view';
import { getMachineStatus } from './machine-state';
import { getRunState } from './run-state';
import { parseMachineTelemetry } from './telemetry';

const now = new Date('2026-10-25T05:00:00.000Z');
const secondsAgo = (seconds: number) =>
  new Date(now.getTime() - seconds * 1000).toISOString();

function runner(overrides: Partial<DevboxAdminRunner> = {}): DevboxAdminRunner {
  return {
    actor_id: 'actor',
    capabilities: {
      reportedAt: secondsAgo(10),
      resources: {
        cpu: { cores: 8 },
        disk: { freeGiB: 120, freePct: 35 },
        loadAverage: [6, 4, 2],
        memory: { freeBytes: 4 * 1024 ** 3, totalBytes: 16 * 1024 ** 3 },
      },
    },
    created_at: secondsAgo(86_400),
    enabled_features: { run: true },
    heartbeat_enabled: true,
    id: 'runner-1',
    last_heartbeat_at: secondsAgo(10),
    name: 'linux',
    resource_limits: null,
    status: 'online',
    updated_at: secondsAgo(10),
    ...overrides,
  };
}

const activeToken = { active: 1, total: 1 };

function status(overrides: Partial<DevboxAdminRunner>, tokens = activeToken) {
  const value = runner(overrides);
  return getMachineStatus({
    control: value,
    now,
    runner: value,
    telemetryReportedAt: parseMachineTelemetry(value.capabilities).reportedAt,
    tokens,
  });
}

describe('machine state', () => {
  it('is online only with a fresh heartbeat, a credential and online status', () => {
    expect(status({})).toMatchObject({
      state: 'online',
      telemetry: 'fresh',
      trust: 'trusted',
    });
  });

  it('treats a heartbeat older than placement freshness as late, not online', () => {
    expect(status({ last_heartbeat_at: secondsAgo(90) })).toMatchObject({
      state: 'telemetry_late',
      telemetry: 'stale',
    });
  });

  it('reports a long-silent machine as disconnected with stale telemetry', () => {
    expect(status({ last_heartbeat_at: secondsAgo(20 * 60) })).toMatchObject({
      state: 'disconnected',
      telemetry: 'stale',
    });
  });

  it('marks old resource reports stale even when the heartbeat is fresh', () => {
    expect(
      status({
        capabilities: { reportedAt: secondsAgo(10 * 60), resources: {} },
      }).telemetry
    ).toBe('stale');
  });

  it('flags a machine without an active credential as untrusted first', () => {
    expect(status({}, { active: 0, total: 2 })).toMatchObject({
      state: 'untrusted',
      trust: 'no_active_credential',
    });
  });

  it('distinguishes setup that never heartbeated from revoked machines', () => {
    expect(
      status({ last_heartbeat_at: null, status: 'registered' }).state
    ).toBe('awaiting_first_heartbeat');
    expect(status({ status: 'revoked' }, { active: 0, total: 1 }).state).toBe(
      'revoked'
    );
  });

  it('shows draining and heartbeat-disabled machines explicitly', () => {
    expect(status({ drain_requested_at: secondsAgo(5) }).state).toBe(
      'draining'
    );
    expect(
      status({ heartbeat_enabled: false, last_heartbeat_at: secondsAgo(3600) })
        .state
    ).toBe('heartbeat_disabled');
  });
});

describe('run state', () => {
  it('never reports an active run on an unreachable machine as running', () => {
    expect(getRunState('running', 'disconnected')).toBe('outcome_unknown');
    expect(getRunState('claimed', 'telemetry_late')).toBe('outcome_unknown');
    expect(getRunState('running', 'online')).toBe('running');
  });

  it('keeps terminal and queued states, and flags unknown vocabulary', () => {
    expect(getRunState('succeeded', 'disconnected')).toBe('succeeded');
    expect(getRunState('queued', 'disconnected')).toBe('queued');
    expect(getRunState('exploded', 'online')).toBe('unrecognized');
  });
});

describe('telemetry', () => {
  it('derives memory, load per core and disk headroom', () => {
    expect(parseMachineTelemetry(runner().capabilities)).toMatchObject({
      cpuCores: 8,
      diskFreeGiB: 120,
      diskFreePercent: 35,
      loadPerCorePercent: 75,
      memoryUsedPercent: 75,
    });
  });

  it('returns nulls rather than zeros for missing readings', () => {
    expect(parseMachineTelemetry(null)).toMatchObject({
      cpuCores: null,
      diskFreePercent: null,
      loadPerCorePercent: null,
      memoryUsedPercent: null,
      reportedAt: null,
    });
  });
});

describe('fleet view', () => {
  it('orders machines needing action first and counts unknown outcomes', () => {
    const run = (overrides: Partial<DevboxAdminRun>): DevboxAdminRun => ({
      actor_id: 'actor',
      command: ['bun', 'test'],
      completed_at: null,
      created_at: secondsAgo(60),
      exit_code: null,
      id: 'run',
      lease_id: 'lease',
      preview_ports: [],
      runner_id: 'runner-1',
      started_at: secondsAgo(50),
      status: 'running',
      timeout_seconds: null,
      updated_at: secondsAgo(50),
      ...overrides,
    });
    const snapshot = {
      runnerTokens: [
        { created_at: '', id: 't1', revoked_at: null, runner_id: 'runner-1' },
        { created_at: '', id: 't2', revoked_at: null, runner_id: 'runner-2' },
      ],
      runners: [
        runner(),
        runner({
          id: 'runner-2',
          last_heartbeat_at: secondsAgo(3600),
          name: 'm4',
        }),
      ],
      runs: [
        run({ id: 'a' }),
        run({ id: 'b', runner_id: 'runner-2' }),
        run({ id: 'c', runner_id: null, started_at: null, status: 'queued' }),
      ],
    } as unknown as DevboxControlSnapshot;

    const view = buildFleetView(snapshot, now);

    expect(view.machines.map((machine) => machine.name)).toEqual([
      'm4',
      'linux',
    ]);
    expect(view.attention.map((machine) => machine.name)).toEqual(['m4']);
    expect(view.counts).toMatchObject({
      attention: 1,
      online: 1,
      outcomeUnknown: 1,
      queued: 1,
      running: 1,
      runWindow: 3,
    });
  });
});
