import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { resourceShims } from './resources-command';
import { ownershipLauncherProtocol } from './resources-compatibility';
import { atomicJson, defaultResourceConfig } from './resources-config';
import {
  ownershipFence,
  validOwnershipFence,
} from './resources-ownership-fence';
import { installResourceShims, setupResources } from './resources-setup';
import { occupancy, withAdmission } from './resources-slots';

const homes: string[] = [];
afterEach(async () => {
  for (const home of homes.splice(0))
    await rm(home, { recursive: true, force: true });
});
async function fixture() {
  const home = await realpath(
    await mkdtemp(join(tmpdir(), 'resource-ownership-fence-'))
  );
  homes.push(home);
  await atomicJson(join(home, 'config.json'), defaultResourceConfig());
  return home;
}
const exists = (path: string) =>
  readFile(path).then(
    () => true,
    () => false
  );
it('setup upgrades launcher capability but never publishes the ownership fence', async () => {
  const home = await fixture();
  await setupResources({ home, roots: [home], shell: 'none' });
  expect(await readFile(join(home, 'bin/node'), 'utf8')).toContain(
    ownershipLauncherProtocol
  );
  expect(await exists(join(home, 'slots', ownershipFence))).toBe(false);
  await withAdmission(home, async () => {});
  expect(await readFile(join(home, 'slots', ownershipFence), 'utf8')).toBe(
    '1\n'
  );
  expect((await occupancy(home)).occupied).toEqual([]);
});
it('a budget-capable launcher without identity support blocks publication before work starts', async () => {
  const home = await fixture();
  await installResourceShims(home);
  for (const name of resourceShims) {
    const path = join(home, 'bin', name);
    await writeFile(
      path,
      (await readFile(path, 'utf8')).replace(
        `${ownershipLauncherProtocol}\n`,
        ''
      )
    );
  }
  let entered = false;
  await expect(
    withAdmission(home, async () => {
      entered = true;
    })
  ).rejects.toThrow('identity-capable release');
  expect(entered).toBe(false);
  expect(await exists(join(home, 'slots', ownershipFence))).toBe(false);
  expect(await exists(join(home, 'slots/budget-v3'))).toBe(false);
});
it('an empty or malformed ownership fence never counts as compatible', async () => {
  const home = await fixture();
  const path = join(home, 'slots', ownershipFence);
  await mkdir(join(home, 'slots'));
  for (const value of ['', '3\n', '1\nextra']) {
    await writeFile(path, value);
    await expect(validOwnershipFence(path)).rejects.toThrow(
      'Malformed process-ownership'
    );
  }
});
