import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHostsAction } from './resources-hosts-cli';
import { proposedHostRegistry } from './resources-hosts-config';
import { compareWithCurrent, simulateHosts } from './resources-hosts-sim';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('dry-run simulation of the measured queue', () => {
  it('finishes every job within each host ceiling and beats the single-host lanes', () => {
    const { current, proposed } = compareWithCurrent();
    expect(current.unfinished).toEqual([]);
    expect(proposed.unfinished).toEqual([]);
    for (const host of proposedHostRegistry().hosts) {
      expect(proposed.peak[host.id]!.heavy).toBeLessThanOrEqual(
        host.slots.heavy
      );
      expect(proposed.peak[host.id]!.light).toBeLessThanOrEqual(
        host.slots.light
      );
    }
    expect(current.peak.m4).toEqual({ light: 0, heavy: 2 });
    expect(proposed.makespan).toBeLessThan(current.makespan);
    expect(proposed.maxWait).toBeLessThan(current.maxWait);
    // Disjoint jobs on M4 and Linux overlap in time.
    const m4 = proposed.runs.find((run) => run.hostId === 'm4')!;
    const linux = proposed.runs.find((run) => run.hostId === 'skr-linux-lan')!;
    expect(m4.start < linux.end && linux.start < m4.end).toBe(true);
  });

  it('degrades to the local host when the runner is stale', () => {
    const { proposed } = compareWithCurrent();
    const degraded = simulateHosts(
      proposedHostRegistry(),
      proposed.runs.map((run, index) => ({
        id: run.id,
        project: run.project,
        jobClass: run.jobClass,
        arrival: index,
        duration: run.end - run.start,
      })),
      () => ({
        m4: { healthy: true, diskFreeGiB: 100 },
        'skr-linux-lan': {
          healthy: false,
          reason: 'runner telemetry is stale',
        },
      })
    );
    expect(degraded.unfinished).toEqual([]);
    expect(degraded.runs.every((run) => run.hostId === 'm4')).toBe(true);
    expect(degraded.peak.m4!.heavy).toBeLessThanOrEqual(2);
  });

  it('prints the dry run without touching admission state', async () => {
    const home = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-hosts-sim-'))
    );
    dirs.push(home);
    const out: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
      });
    try {
      await runHostsAction(home, ['--simulate', '--json']);
      await runHostsAction(home, []);
    } finally {
      write.mockRestore();
    }
    const parsed = JSON.parse(out[0]!) as { proposed: { makespan: number } };
    expect(parsed.proposed.makespan).toBeGreaterThan(0);
    expect(out[1]).toContain('Multi-host admission: off');
  });
});
