import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { requireProcessIdentity } from './resources-process-identity';
import { hasSetupMaintenanceLease, withAdmission } from './resources-slots';

const homes: string[] = [];
afterEach(async () => {
  for (const home of homes.splice(0))
    await rm(home, { recursive: true, force: true });
});
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'resources-maintenance-'));
  homes.push(home);
  await mkdir(join(home, 'admission'));
  const owner = {
    scheduler: 2,
    pid: process.ppid,
    ownershipVersion: 1,
    pidStart: requireProcessIdentity(process.ppid),
    token: 'maintenance-test',
    cwd: home,
    tool: 'rollout',
    queuedAt: new Date().toISOString(),
  };
  const file = join(home, 'admission/owner.json');
  await writeFile(file, JSON.stringify(owner));
  return { home, owner, file };
}
it('only accepts the matching capability belonging to a live rollout ancestor', async () => {
  const { home } = await fixture();
  expect(
    await hasSetupMaintenanceLease(home, {
      TTR_RESOURCES_MAINTENANCE: 'maintenance-test',
    })
  ).toBe(true);
  expect(await hasSetupMaintenanceLease(home, {})).toBe(false);
  expect(
    await hasSetupMaintenanceLease(home, { TTR_RESOURCES_MAINTENANCE: 'other' })
  ).toBe(false);
});
it.each([
  { pid: process.pid },
  { pid: 2147483647 },
  { tool: 'admission' },
  { scheduler: 1 },
])('rejects an unrelated, dead or non-rollout holder: %j', async (change) => {
  const { home, owner, file } = await fixture();
  await writeFile(file, JSON.stringify({ ...owner, ...change }));
  expect(
    await hasSetupMaintenanceLease(home, {
      TTR_RESOURCES_MAINTENANCE: 'maintenance-test',
    })
  ).toBe(false);
});
it('queue admission never uses the setup capability or enters an occupied mutex', async () => {
  const { home, file } = await fixture();
  let attempts = 0;
  let entered = false;
  const before = await readFile(file, 'utf8');
  expect(
    await withAdmission(
      home,
      async () => {
        entered = true;
      },
      () => ++attempts > 3
    )
  ).toBeUndefined();
  expect(entered).toBe(false);
  expect(await readFile(file, 'utf8')).toBe(before);
});
it('a dead rollout leaves admission closed rather than reclaiming an interrupted installation', async () => {
  const { home, file, owner } = await fixture();
  await writeFile(file, JSON.stringify({ ...owner, pid: 2147483647 }));
  await writeFile(
    join(home, 'admission/mutation.json'),
    JSON.stringify({ token: owner.token })
  );
  await expect(withAdmission(home, async () => 'unsafe')).rejects.toThrow(
    'Interrupted SDK rollout'
  );
  expect(JSON.parse(await readFile(file, 'utf8')).token).toBe(owner.token);
});

it('reclaims a dead preparation lease with no mutation marker or backup', async () => {
  const { home, file, owner } = await fixture();
  await writeFile(file, JSON.stringify({ ...owner, pid: 2147483647 }));
  expect(await withAdmission(home, async () => 'admitted')).toBe('admitted');
});
