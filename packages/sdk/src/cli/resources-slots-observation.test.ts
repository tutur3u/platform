import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultResourceConfig } from './resources-config';
import { newOwner, occupancy, tickets } from './resources-slots';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
}));
const homes: string[] = [];
const config = {
  ...defaultResourceConfig(),
  validationLanes: 1 as const,
  maxValidationLanes: 1 as const,
};
const originalRead = fs.readFile;
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true }))
  );
});
async function fixture() {
  const home = await fs.mkdtemp(join(tmpdir(), 'ttr-slot-observer-'));
  homes.push(home);
  const slot = join(home, 'slots', '0');
  await fs.mkdir(slot, { recursive: true });
  const owner = newOwner('observer-fixture');
  const path = join(slot, 'owner.json');
  await fs.writeFile(path, JSON.stringify(owner));
  return { home, slot, path, owner };
}

describe('slot observations concurrent with release', () => {
  it.each(['ENOENT', 'ENOTDIR'])(
    'treats a release during the owner read as absent (%s)',
    async (code) => {
      const { home, slot, path } = await fixture();
      let released = false;
      vi.spyOn(fs, 'readFile').mockImplementation(async (file, options) => {
        if (String(file) === path) {
          released = true;
          await fs.rm(slot, { recursive: true });
          throw Object.assign(new Error('released during observation'), {
            code,
          });
        }
        return originalRead(file, options);
      });
      expect(await occupancy(home, false, config)).toEqual({
        owners: [],
        ownerSlots: [],
        occupied: [],
        legacy: false,
        initializing: false,
      });
      expect(released).toBe(true);
    }
  );
  it('keeps a recent initializing directory occupied', async () => {
    const { home, path, slot } = await fixture();
    await fs.rm(path);
    expect(await occupancy(home, false, config)).toMatchObject({
      occupied: [slot],
      initializing: true,
    });
  });
  it('keeps a live owner occupied', async () => {
    const { home, slot, owner } = await fixture();
    expect(await occupancy(home, false, config)).toMatchObject({
      owners: [owner],
      occupied: [slot],
      initializing: false,
    });
  });
  it('fails closed on a malformed owner', async () => {
    const { home, path } = await fixture();
    await fs.writeFile(path, '{broken');
    await expect(occupancy(home, false, config)).rejects.toThrow(
      'Malformed resource owner'
    );
  });
  it('fails closed on an invalid slot type', async () => {
    const { home, slot } = await fixture();
    await fs.rm(slot, { recursive: true });
    await fs.writeFile(slot, 'not a directory');
    await expect(occupancy(home, false, config)).rejects.toThrow(
      'Invalid resource directory'
    );
  });
  it('fails closed on an unreadable owner', async () => {
    const { home, path } = await fixture();
    vi.spyOn(fs, 'readFile').mockImplementation(async (file, options) => {
      if (String(file) === path)
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      return originalRead(file, options);
    });
    await expect(occupancy(home, false, config)).rejects.toThrow(
      'Malformed resource owner'
    );
  });

  it('fails closed on a slot stat permission error', async () => {
    const { home, slot } = await fixture();
    const originalStat = fs.stat;
    vi.spyOn(fs, 'stat').mockImplementation(async (path, options) => {
      if (String(path) === slot)
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      return originalStat(path, options);
    });
    await expect(occupancy(home, false, config)).rejects.toMatchObject({
      code: 'EACCES',
    });
  });
  it.each(['slots', 'queue'])(
    'fails closed when the %s root is not a directory',
    async (name) => {
      const home = await fs.mkdtemp(join(tmpdir(), 'ttr-observer-root-'));
      homes.push(home);
      await fs.writeFile(join(home, name), 'invalid root');
      const observation =
        name === 'slots' ? occupancy(home, false, config) : tickets(home);
      await expect(observation).rejects.toMatchObject({ code: 'ENOTDIR' });
    }
  );
  it('fails closed if the persistent budget fence disappears', async () => {
    const { home } = await fixture();
    const path = join(home, 'slots', 'budget-v3');
    await fs.writeFile(path, '3\n');
    vi.spyOn(fs, 'readFile').mockImplementation(async (file, options) => {
      if (String(file) === path) await fs.rm(path);
      return originalRead(file, options);
    });
    await expect(occupancy(home, false, config)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('ignores a queue entry removed after enumeration', async () => {
    const { home, owner } = await fixture();
    const queue = join(home, 'queue');
    await fs.mkdir(queue);
    const path = join(queue, 'one.json');
    await fs.writeFile(path, JSON.stringify(owner));
    vi.spyOn(fs, 'readFile').mockImplementation(async (file, options) => {
      if (String(file) === path) await fs.rm(path);
      return originalRead(file, options);
    });
    expect(await tickets(home)).toEqual([]);
  });
});
