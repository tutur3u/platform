import type { BalancerHostTelemetry } from '@tuturuuu/devbox';
import type { BalancerHost } from './balancer-placement';

// Shared fixtures for balancer tests (never shipped: *-test-fixtures).
export const fixtureHost = (
  id: string,
  patch: Partial<BalancerHost> = {}
): BalancerHost => ({
  id,
  transport: { kind: 'ssh', alias: id },
  hostname: `${id}-host`,
  platform: 'linux',
  arch: 'x64',
  minDiskGiB: 20,
  capacity: { cpus: 20, memoryGiB: 32 },
  reserved: { cpus: 4, memoryGiB: 8, diskGiB: 20 },
  weights: {
    light: { cpus: 1, memoryGiB: 2 },
    heavy: { cpus: 4, memoryGiB: 6 },
  },
  ...patch,
});

export const fixtureTelemetry = (
  host: BalancerHost,
  now: number,
  patch: Partial<BalancerHostTelemetry> = {}
): BalancerHostTelemetry => ({
  deviceId: host.id,
  receivedAt: new Date(now - 1_000).toISOString(),
  hostname: host.hostname,
  platform: host.platform,
  arch: host.arch,
  cpus: host.capacity.cpus,
  memoryGiB: host.capacity.memoryGiB,
  load1: 1,
  memoryPressure: 'normal',
  diskFreeGiB: 200,
  ttrVersion: '0.29.0',
  queue: { enabled: true, lanes: 2, occupied: 0, waiting: 0 },
  activeRuns: [],
  ...patch,
});
