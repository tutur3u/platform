import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultHoldsDir,
  holdOwners,
  holdsDirs,
  isBusy,
  readHolds,
} from './storage-holds';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await chmod(dir, 0o700).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});
async function temp() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'ttr-holds-')));
  dirs.push(dir);
  return dir;
}

describe('hold files', () => {
  it("reads every project's hold file with owners, comments and globs", async () => {
    const dir = await temp();
    await writeFile(
      join(dir, 'mastermind.txt'),
      '# header\n/a/held # reason\n\n   # indented comment\n'
    );
    await writeFile(join(dir, 'tuturuuu.txt'), '/b/glob-*\n');
    await writeFile(join(dir, 'upskii.txt'), '/d/upskii-evidence\n');
    // Any extension still protects: an unexpected name widens, never drops.
    await writeFile(join(dir, 'notes.md'), '/c/also-held\n');
    await mkdir(join(dir, 'nested'));
    expect(readHolds([dir])).toEqual([
      { path: '/a/held', owner: 'mastermind', glob: false },
      { path: '/c/also-held', owner: 'notes', glob: false },
      { path: '/b/glob-*', owner: 'tuturuuu', glob: true },
      { path: '/d/upskii-evidence', owner: 'upskii', glob: false },
    ]);
  });

  it('skips dotfiles and editor swap or backup files with a warning', async () => {
    const dir = await temp();
    await writeFile(join(dir, 'tuturuuu.txt'), '/a/held\n');
    for (const name of [
      '.DS_Store',
      'tuturuuu.txt~',
      '.tuturuuu.txt.swp',
      'notes.swo',
    ])
      await writeFile(join(dir, name), 'binary or stale\n');
    const warnings: string[] = [];
    expect(readHolds([dir], (message) => warnings.push(message))).toEqual([
      { path: '/a/held', owner: 'tuturuuu', glob: false },
    ]);
    expect(warnings).toHaveLength(4);
    expect(warnings[0]).toMatch(
      /ignoring .* \(dotfile or editor swap\/backup\)/u
    );
  });

  it('stops on a malformed or relative hold, naming the file and line', async () => {
    const dir = await temp();
    await writeFile(
      join(dir, 'mastermind.txt'),
      '# header\n/a/held\nrelative/evidence # meant to be held\n'
    );
    expect(() => readHolds([dir])).toThrow(
      /Invalid hold in .*mastermind\.txt:3: "relative\/evidence # meant to be held"/u
    );
  });

  it('adds custom holds directories to the shared default, never replacing it', () => {
    expect(holdsDirs({}, [])).toEqual([defaultHoldsDir]);
    expect(
      holdsDirs({ TTR_STORAGE_HOLDS_DIRS: '/extra/a:/extra/b' }, ['/flag'])
    ).toEqual([defaultHoldsDir, '/extra/a', '/extra/b', '/flag']);
  });

  it('treats a missing directory as no holds but refuses an unreadable one', async () => {
    const dir = await temp();
    expect(readHolds([join(dir, 'missing')])).toEqual([]);
    const locked = join(dir, 'locked');
    await mkdir(locked);
    await chmod(locked, 0o000);
    if (process.getuid?.() !== 0)
      expect(() => readHolds([locked])).toThrow(/Cannot read holds/u);
  });

  it('covers the held path, everything below it and everything above it', async () => {
    const root = await temp();
    const holds = [{ path: join(root, 'a', 'b'), owner: 'lane', glob: false }];
    expect(holdOwners(join(root, 'a', 'b'), holds)).toEqual(['lane']);
    expect(holdOwners(join(root, 'a', 'b', 'c'), holds)).toEqual(['lane']);
    expect(holdOwners(join(root, 'a'), holds)).toEqual(['lane']);
    expect(holdOwners(join(root, 'other'), holds)).toEqual([]);
  });

  it('matches globs conservatively by their directory prefix', async () => {
    const root = await temp();
    const holds = [
      { path: join(root, 'tmp', 'evidence-*'), owner: 'lane', glob: true },
    ];
    expect(holdOwners(join(root, 'tmp', 'evidence-1'), holds)).toEqual([
      'lane',
    ]);
    expect(holdOwners(join(root, 'tmp', 'unrelated'), holds)).toEqual(['lane']);
    expect(holdOwners(join(root, 'elsewhere'), holds)).toEqual([]);
  });
});

describe('busy paths', () => {
  it('counts processes working inside, not above, and ignores this process', async () => {
    const root = await temp();
    const target = join(root, 'wt');
    expect(isBusy(target, [{ pid: 10, cwd: join(target, 'src') }])).toBe(true);
    expect(isBusy(target, [{ pid: 10, cwd: root }])).toBe(false);
    expect(isBusy(target, [{ pid: process.pid, cwd: target }])).toBe(false);
  });
});
