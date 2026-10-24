import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { atomicJson, defaultResourceConfig } from './resources-config';
import { ancestryWait, queuedResourceCommand } from './resources-queue';
import { admittedMarker, newOwner } from './resources-slots';
import { realNode } from './resources-test-fixtures';

const homes: string[] = [];
const originalWait = ancestryWait.ms;
afterEach(async () => {
  ancestryWait.ms = originalWait;
  vi.unstubAllEnvs();
  for (const path of homes.splice(0))
    await rm(path, { recursive: true, force: true });
});
it.each([true, false])(
  'bounds a legacy ancestor wait with marker=%s and readable lineage',
  async (marked) => {
    const home = await mkdtemp(join(tmpdir(), 'resource-unknown-nesting-'));
    homes.push(home);
    await atomicJson(join(home, 'config.json'), defaultResourceConfig());
    const owner = {
      ...newOwner('legacy'),
      pid: process.ppid,
      ownershipVersion: undefined,
      pidStart: undefined,
    };
    await atomicJson(join(home, 'slots/0/owner.json'), owner);
    vi.stubEnv(admittedMarker, marked ? owner.token : '');
    vi.stubEnv('TTR_RESOURCE_OWNER', '');
    ancestryWait.ms = 0;
    const marker = join(home, 'must-not-run');
    await expect(
      queuedResourceCommand(
        home,
        realNode,
        [
          '-e',
          `require('fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`,
        ],
        process.env,
        true,
        1,
        undefined,
        undefined,
        async () => ({ admit: true })
      )
    ).rejects.toThrow('drain legacy jobs');
    expect(existsSync(marker)).toBe(false);
  },
  5000
);
