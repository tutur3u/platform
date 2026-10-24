import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { withAdmission } from './resources-slots';
import { privateFixtures } from './resources-test-fixtures';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open), link: vi.fn(actual.link) };
});
const fixtures = privateFixtures();
afterEach(async () => {
  vi.restoreAllMocks();
  await fixtures.cleanup();
});
it('fsyncs once before publication, warns once, skips staging on reuse and sweeps stale stages', async () => {
  const home = await fixtures.home();
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );
  let synced = false,
    stages = 0,
    links = 0;
  vi.mocked(fs.open).mockImplementation(async (...args) => {
    const file = await actual.open(...args);
    if (String(args[0]).includes('/budget-fence.')) {
      stages++;
      const sync = file.sync.bind(file);
      vi.spyOn(file, 'sync').mockImplementation(async () => {
        await sync();
        synced = true;
      });
    }
    return file;
  });
  vi.mocked(fs.link).mockImplementation(async (from, to) => {
    if (String(to).endsWith('/budget-v3')) {
      expect(synced).toBe(true);
      expect(await fs.readFile(from, 'utf8')).toBe('3\n');
      links++;
    }
    return actual.link(from, to);
  });
  const output = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  await fs.writeFile(join(home, 'budget-fence.deadbeef.tmp'), '');
  await withAdmission(home, async () => {});
  await fs.writeFile(join(home, 'budget-fence.cafebabe.tmp'), '');
  await withAdmission(home, async () => {});
  expect(stages).toBe(1);
  expect(links).toBe(1);
  expect(
    output.mock.calls.filter(([text]) =>
      String(text).includes('Published budget protocol 3')
    )
  ).toHaveLength(1);
  expect(output.mock.calls.flat().join('')).toContain(
    'Upgrade every global CLI'
  );
  expect(
    (await fs.readdir(home)).some((name) => name.startsWith('budget-fence.'))
  ).toBe(false);
});
