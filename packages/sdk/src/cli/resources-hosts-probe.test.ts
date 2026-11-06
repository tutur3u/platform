import { describe, expect, it, vi } from 'vitest';
import { hostRegistrySchema } from './resources-hosts-config';
import {
  admissionProbeArgs,
  admissionProbeCommand,
  probeAutomaticHosts,
} from './resources-hosts-probe';
import { preferenceRegistry } from './resources-hosts-sim';

const registry = {
  ...preferenceRegistry(),
  hosts: preferenceRegistry().hosts.map((host) => ({
    ...host,
    sshHost: host.id,
  })),
};
const sample = {
  platform: 'darwin',
  occupied: 8,
  waiting: 22,
  effectiveLanes: 8,
  diskFreeGiB: 2000,
  loadPerCpu: 0.3,
};

describe('live SSH admission probes', () => {
  it('counts local queue owners and waiters independently of devbox activity', async () => {
    const exec = vi.fn(async () => JSON.stringify(sample));
    const results = await probeAutomaticHosts(registry, exec);
    expect(results['skr-studio']).toEqual({ healthy: true, sample });
    expect(exec).toHaveBeenCalledWith('skr-sonha');
    expect(results.m4).toBeUndefined();
  });
  it('marks failed SSH and malformed probes ineligible with an explanation', async () => {
    const results = await probeAutomaticHosts(registry, async (host) => {
      if (host === 'skr-studio')
        throw new Error('connection refused /private/path');
      if (host === 'skr-sonha')
        return JSON.stringify({ ...sample, diskFreeGiB: null });
      return JSON.stringify(sample);
    });
    for (const id of ['skr-studio', 'skr-sonha']) {
      expect(results[id]).toEqual({
        healthy: false,
        reason:
          'SSH admission probe failed, timed out, or returned invalid telemetry',
      });
    }
    expect(JSON.stringify(results)).not.toContain('/private/path');
  });
  it('fails closed without an operator-configured SSH alias', async () => {
    const exec = vi.fn(async () => JSON.stringify(sample));
    const results = await probeAutomaticHosts(preferenceRegistry(), exec);
    expect(results['skr-studio']).toMatchObject({
      healthy: false,
      reason: expect.stringContaining('sshHost'),
    });
    expect(exec).not.toHaveBeenCalled();
  });
  it('uses SSH config, pinned host keys and fixed probe text without workload interpolation', () => {
    expect(admissionProbeArgs('skr-sonha')).toEqual([
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=5',
      'skr-sonha',
      admissionProbeCommand,
    ]);
    expect(admissionProbeArgs('skr-sonha')).not.toContain('-J');
    expect(admissionProbeCommand).not.toContain('StrictHostKeyChecking=no');
    expect(
      hostRegistrySchema.safeParse({
        ...registry,
        hosts: registry.hosts.map((host) => ({
          ...host,
          sshHost: '-oProxyCommand=bad',
        })),
      }).success
    ).toBe(false);
  });
});
