import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DevboxAdminRunner } from '@/lib/devboxes/admin-store';
import { buildMachineView } from '@/lib/fleet/fleet-view';
import type { FleetTranslator } from './fleet-data';
import { MachineCard } from './machine-card';

const now = new Date('2026-10-25T05:00:00.000Z');
const t: FleetTranslator = (key, values) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

function machine(lastHeartbeatSecondsAgo: number) {
  const at = new Date(
    now.getTime() - lastHeartbeatSecondsAgo * 1000
  ).toISOString();
  const runner: DevboxAdminRunner = {
    activity: {
      active_leases: 1,
      kept_leases: 0,
      queued_runs: 0,
      running_runs: 1,
    },
    actor_id: 'actor',
    capabilities: {
      os: { arch: 'arm64', hostname: 'thanh-studio', platform: 'darwin' },
      reportedAt: at,
      resources: {
        cpu: { cores: 10 },
        disk: { freeGiB: 200, freePct: 40 },
        loadAverage: [2, 2, 2],
        memory: { freeBytes: 8 * 1024 ** 3, totalBytes: 32 * 1024 ** 3 },
      },
    },
    created_at: at,
    enabled_features: { run: true },
    heartbeat_enabled: true,
    id: 'runner-1',
    last_heartbeat_at: at,
    name: 'thanh',
    resource_limits: null,
    status: 'online',
    updated_at: at,
  };
  return buildMachineView(
    runner,
    {
      runnerTokens: [
        { created_at: at, id: 'tok', revoked_at: null, runner_id: 'runner-1' },
      ],
    },
    now
  );
}

describe('MachineCard', () => {
  it('shows live readings for a fresh machine', () => {
    render(
      <MachineCard
        href="/m"
        locale="en"
        machine={machine(10)}
        now={now}
        t={t}
      />
    );

    expect(screen.getByText('state.online')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.getByText('24.0 GiB / 32.0 GiB')).toBeTruthy();
    expect(screen.queryByText(/recovery\./)).toBeNull();
  });

  it('hides old readings and explains recovery for a disconnected machine', () => {
    render(
      <MachineCard
        href="/m"
        locale="en"
        machine={machine(30 * 60)}
        now={now}
        t={t}
      />
    );

    expect(screen.getByText('state.disconnected')).toBeTruthy();
    expect(screen.getByText(/^recovery\.disconnected/)).toBeTruthy();
    expect(
      screen.getAllByText('resources.unknown').length
    ).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('20%')).toBeNull();
    expect(screen.queryByText('24.0 GiB / 32.0 GiB')).toBeNull();
    expect(screen.getByText('telemetry.stale')).toBeTruthy();
  });
});
