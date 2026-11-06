import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runResourcesCommand } from './resources';
import { proposedHostRegistry } from './resources-hosts-config';
import { probeAutomaticHosts } from './resources-hosts-probe';

const homes: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true }))
  );
});
it('P3: status reports an invalid floor as structured unavailable admission instead of throwing', async () => {
  const home = await mkdtemp(join(tmpdir(), 'ttr-floor-status-'));
  homes.push(home);
  vi.stubEnv('TTR_RESOURCES_HOME', home);
  vi.stubEnv('TTR_RESOURCES_MIN_FREE_GIB', 'invalid');
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  await expect(
    runResourcesCommand(['status', '--json'])
  ).resolves.toBeUndefined();
  const status = JSON.parse(String(out.mock.calls.at(-1)?.[0]));
  expect(status.disk).toMatchObject({
    admit: false,
    floorGiB: null,
    unknown: true,
    reason: expect.stringContaining('TTR_RESOURCES_MIN_FREE_GIB'),
  });
});
it('P3: remote probe explains the invalid admission configuration', async () => {
  const registry = proposedHostRegistry();
  registry.hosts = registry.hosts
    .filter((host) => host.kind === 'runner')
    .map((host) => ({ ...host, sshHost: 'test-host' }));
  const result = await probeAutomaticHosts(registry, async () =>
    JSON.stringify({
      platform: 'linux',
      occupied: 0,
      waiting: 0,
      effectiveLanes: 2,
      diskFreeGiB: 100,
      loadPerCpu: 0.1,
      admissionError:
        'TTR_RESOURCES_MIN_FREE_GIB must be a nonnegative finite number.',
    })
  );
  expect(result['skr-linux-lan']).toMatchObject({
    healthy: false,
    reason: expect.stringContaining('TTR_RESOURCES_MIN_FREE_GIB'),
  });
});
