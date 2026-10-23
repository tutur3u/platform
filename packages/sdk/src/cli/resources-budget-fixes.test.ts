import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { limitCommand } from './resources-command';
import { atomicJson, readResourceConfig } from './resources-config';
import { occupancy, withAdmission } from './resources-slots';
import { privateFixtures } from './resources-test-fixtures';

const fixtures = privateFixtures();
afterEach(() => fixtures.cleanup());
describe('budget worker enforcement', () => {
  it.each([
    ['test'],
    ['test', '--workers=24'],
    ['test', '--workers', '24'],
    ['test', '-j24'],
    ['test', '-j', '24'],
    ['test', '--workers=50%'],
  ])(
    'overrides CLI and config defaults with the charged workers: %j',
    async (...args) => {
      const home = await fixtures.home();
      const config = (await readResourceConfig(home))!;
      expect(limitCommand('playwright', args, config)).toEqual([
        'test',
        '--workers=2',
      ]);
      expect(
        limitCommand('node', ['node_modules/playwright/cli.js', ...args], {
          ...config,
          vitestWorkers: 1,
        })
      ).toEqual(['node_modules/playwright/cli.js', 'test', '--workers=1']);
    }
  );
});
describe('persistent budget compatibility fence', () => {
  it('publishes before the first budget action and retains it after budget removal', async () => {
    const home = await fixtures.home();
    const original = (await readResourceConfig(home))!;
    const budget = {
      lanes: 2,
      tokens: 2,
      memoryGiB: 4,
      borrow: true,
      projects: [
        { id: 'test', roots: [home], lanes: 2, tokens: 2, memoryGiB: 4 },
      ],
    };
    await atomicJson(join(home, 'config.json'), { ...original, budget });
    const fence = join(home, 'slots', 'budget-v3');
    await withAdmission(home, async () => {
      expect(await readFile(fence, 'utf8')).toBe('3\n');
      expect((await occupancy(home)).owners).toEqual([]);
    });
    await atomicJson(join(home, 'config.json'), original);
    expect((await occupancy(home)).occupied).toEqual([]);
    expect(await readFile(fence, 'utf8')).toBe('3\n');
    await writeFile(fence, 'invalid');
    await expect(occupancy(home)).rejects.toThrow(/compatibility fence/u);
    await rm(fence);
  });
});
