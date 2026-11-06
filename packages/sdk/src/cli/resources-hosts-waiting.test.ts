import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { HostRegistry } from './resources-hosts-config';
import { hostsRun } from './resources-hosts-dispatch';
import {
  enqueueHostTicket,
  type HostTicket,
  previewHostTicket,
  removeHostTicket,
  reservationPath,
} from './resources-hosts-ledger';

const registry: HostRegistry = {
  version: 1,
  hubHostname: hostname(),
  telemetryTtlSeconds: 120,
  fairness: { maxBypass: 4 },
  hosts: [
    {
      id: 'local',
      kind: 'local',
      platform: process.platform === 'darwin' ? 'darwin' : 'linux',
      capacity: { cpus: 8, memoryGiB: 64 },
      reserved: { cpus: 0, memoryGiB: 0, diskGiB: 50 },
      slots: { heavy: 2, light: 1 },
      workers: { heavy: 1, light: 1 },
      weights: {
        heavy: { cpus: 1, memoryGiB: 1 },
        light: { cpus: 8, memoryGiB: 1 },
      },
    },
  ],
};
const homes: string[] = [];
afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});
const setup = async () => {
  const home = await mkdtemp(join(tmpdir(), 'ttr-waiting-'));
  homes.push(home);
  const ticket: HostTicket = {
    token: randomUUID(),
    pid: process.pid,
    project: 'older',
    jobClass: 'heavy',
    queuedAt: 1,
    bypassed: 0,
    remoteOk: true,
    placement: 'auto',
  };
  return { home, ticket };
};
describe('automatic placement with older waiters', () => {
  it('previews an already-enqueued ticket only once', async () => {
    const { home, ticket } = await setup();
    const single: HostRegistry = {
      ...registry,
      hosts: registry.hosts.map((host) => ({
        ...host,
        slots: { heavy: 1, light: 1 },
      })),
    };
    await enqueueHostTicket(home, ticket);
    const preview = await previewHostTicket(home, ticket, single, {
      localDiskFreeGiB: 100,
    });
    expect(preview.hostId).toBe('local');
    expect(preview.reason).toBeUndefined();
  });
  it.each(['older assignment', 'starved hold'])(
    'waits instead of refusing: %s',
    async (scenario) => {
      const { home, ticket } = await setup();
      const starved = scenario === 'starved hold';
      ticket.bypassed = starved ? 4 : 0;
      ticket.jobClass = starved ? 'light' : 'heavy';
      await enqueueHostTicket(home, ticket);
      const token = randomUUID();
      const path = reservationPath(home, 'local', token);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        JSON.stringify({
          token,
          pid: process.pid,
          hostId: 'local',
          jobClass: 'heavy',
          project: 'active',
          scope: 'host',
          createdAt: new Date().toISOString(),
        })
      );
      let queued = false;
      const messages: string[] = [];
      const result = await hostsRun({
        home,
        registry,
        auto: true,
        command: 'true',
        args: [],
        jobClass: 'heavy',
        deps: {
          fleet: async () => {
            throw new Error('local only');
          },
          localDiskFreeGiB: async () => {
            if (queued) await removeHostTicket(home, ticket);
            return 100;
          },
          localDiskGate: async () => ({ admit: true, freeGiB: 100 }),
          commitPlan: async () => ({ sha: 'a'.repeat(40), prefix: '' }),
          runLocal: async () => 0,
          runRemote: async () => {
            throw new Error('local only');
          },
          pollMs: 1,
          log: (message) => {
            messages.push(message);
            if (message.startsWith('queued ')) queued = true;
          },
        },
      });
      expect(result).toBe(0);
      expect(queued).toBe(true);
      expect(
        messages.some((message) =>
          message.includes('automatic placement refused')
        )
      ).toBe(false);
    }
  );
});
