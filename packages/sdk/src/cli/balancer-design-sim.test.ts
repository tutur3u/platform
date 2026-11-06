import { describe, expect, it } from 'vitest';
import type { HostRegistry } from './resources-hosts-config';
import type { HostState } from './resources-hosts-plan';
import { measuredWorkload, simulateHosts } from './resources-hosts-sim';

// Prototype evidence for the balancer's placement design: the planner the
// balancer reuses unchanged keeps every host inside its lanes and never
// places onto a host whose telemetry is stale, across a fleet larger than
// the original M4 + Linux registry.
const host = (
  id: string,
  preference: number,
  lanes: number
): HostRegistry['hosts'][number] => ({
  id,
  kind: 'runner',
  runnerId: id,
  capacity: { cpus: 20, memoryGiB: 32 },
  reserved: { cpus: 4, memoryGiB: 8, diskGiB: 20 },
  slots: { light: 0, heavy: lanes },
  weights: {
    light: { cpus: 2, memoryGiB: 4 },
    heavy: { cpus: 2, memoryGiB: 4 },
  },
  workers: { light: 1, heavy: 1 },
  preference,
});
const registry: HostRegistry = {
  version: 1,
  fairness: { maxBypass: 4 },
  telemetryTtlSeconds: 60,
  hosts: [host('linux', 1, 2), host('thanh', 2, 2), host('m4', 9, 2)],
};
// Every balancer run holds one lane of the host queue, so all are heavy.
const jobs = measuredWorkload().map((job) => ({
  ...job,
  jobClass: 'heavy' as const,
}));

describe('balancer placement design prototype', () => {
  it('stays within every host lane ceiling and finishes the measured queue', () => {
    const result = simulateHosts(registry, jobs);
    expect(result.unfinished).toEqual([]);
    for (const entry of registry.hosts)
      expect(result.peak[entry.id]!.heavy).toBeLessThanOrEqual(
        entry.slots.heavy
      );
  });

  it('places nothing on a host while its telemetry is stale', () => {
    const states = (time: number): Record<string, HostState> => ({
      linux:
        time < 900
          ? { healthy: false, reason: 'telemetry is stale' }
          : { healthy: true, diskFreeGiB: 200 },
      thanh: { healthy: true, diskFreeGiB: 200 },
      m4: { healthy: true, diskFreeGiB: 200 },
    });
    const result = simulateHosts(registry, jobs, states);
    expect(result.unfinished).toEqual([]);
    expect(
      result.runs.filter((run) => run.hostId === 'linux' && run.start < 900)
    ).toEqual([]);
    expect(
      new Set(
        result.runs.filter((run) => run.start < 900).map((run) => run.hostId)
      )
    ).toEqual(new Set(['thanh', 'm4']));
  });

  it('holds work queued rather than oversubscribing when every host is unknown', () => {
    const result = simulateHosts(
      registry,
      jobs,
      () => ({
        linux: { healthy: false, reason: 'no telemetry' },
        thanh: { healthy: false, reason: 'no telemetry' },
        m4: { healthy: false, reason: 'no telemetry' },
      }),
      3600
    );
    expect(result.runs).toEqual([]);
    expect(result.unfinished).toHaveLength(jobs.length);
  });
});
