import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { launchDiskGate } from './resources-disk-admission';
import { resourceQueueStatus } from './resources-queue';
import { exists, privateFixtures } from './resources-test-fixtures';

const fixtures = privateFixtures(true);
const { launch } = fixtures;
afterEach(fixtures.cleanup);

const queueModule = resolve('src/cli/resources-queue.ts');
const admissionModule = resolve('src/cli/resources-disk-admission.ts');

describe('launch-time disk admission', { timeout: 30_000 }, () => {
  it('refuses a command that was healthy when queued but is critical when its slot is released', async () => {
    const home = await fixtures.home(1);
    const marker = join(home, 'ran');
    const runner = join(home, 'launch-gate.ts');
    await writeFile(
      runner,
      `import {queuedResourceCommand} from ${JSON.stringify(queueModule)};
import {diskAdmission, launchDiskGate} from ${JSON.stringify(admissionModule)};
import {writeFileSync} from 'node:fs';
delete process.env.TTR_RESOURCES_ADMITTED; delete process.env.TTR_RESOURCE_OWNER;
const GiB = 1024 ** 3;
let probes = 0;
// Healthy at queue time; another lane fills the disk while this one waits.
const probe = async (path) => {
  const free = probes++ === 0 ? 200 : 5;
  return {path, device: 1, totalBytes: 500 * GiB, freeBytes: free * GiB, usedBytes: (500 - free) * GiB, freePercent: free / 5, inodesTotal: null, inodesFree: null, inodeFreePercent: null};
};
const admit = (options) => diskAdmission({...options, env: {}, probe, suggestions: async () => null});
const queued = await admit({cwd: ${JSON.stringify(home)}});
writeFileSync(${JSON.stringify(join(home, 'queued.json'))}, JSON.stringify(queued));
process.exitCode = await queuedResourceCommand(${JSON.stringify(home)}, 'node', ['-e', ${JSON.stringify(`require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`)}], process.env, true, 1, undefined, undefined, launchDiskGate(${JSON.stringify(home)}, admit));`
    );
    const result = await launch(home, [], undefined, runner).done;
    expect(result.code, result.err).toBe(75);
    expect(
      JSON.parse(await readFile(join(home, 'queued.json'), 'utf8'))
    ).toMatchObject({
      pressure: 'ok',
      refuse: false,
    });
    expect(result.err).toContain('refusing a heavy command: disk is critical');
    expect(await exists(marker)).toBe(false);
    // The claimed slot is released, not leaked.
    expect((await resourceQueueStatus(home)).owners).toHaveLength(0);
  });

  it('admits when the launch probe is still healthy', async () => {
    const messages: string[] = [];
    const gate = launchDiskGate(
      '/w',
      async () => ({ pressure: 'ok', refuse: false, message: null }),
      (message) => messages.push(message)
    );
    expect(await gate()).toBeNull();
    const refused = launchDiskGate(
      '/w',
      async () => ({ pressure: 'unknown', refuse: true, message: 'UNKNOWN' }),
      (message) => messages.push(message)
    );
    expect(await refused()).toBe(75);
    expect(messages).toEqual(['UNKNOWN']);
  });
});
