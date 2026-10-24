import {
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeFileAtomically, writeFileAtomicallySync } from './atomic-file';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'ttr-atomic-write-'));
  directories.push(directory);
  return directory;
}

describe('atomic file writes', () => {
  it('replaces a regular file after writing complete contents and retains mode', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'output.json');
    await writeFile(path, 'old', { mode: 0o640 });

    await writeFileAtomically(path, 'complete');

    expect(await readFile(path, 'utf8')).toBe('complete');
    expect((await lstat(path)).mode & 0o777).toBe(0o640);
  });

  it('rejects a symlink target without changing its referent', async () => {
    const directory = await temporaryDirectory();
    const referent = join(directory, 'referent');
    const link = join(directory, 'output');
    await writeFile(referent, 'private');
    await symlink(referent, link);

    await expect(writeFileAtomically(link, 'replacement')).rejects.toThrow(
      'Atomic file target must be a regular file'
    );
    expect(await readFile(referent, 'utf8')).toBe('private');
  });

  it('provides the same no-follow behavior for synchronous template exports', async () => {
    const directory = await temporaryDirectory();
    const referent = join(directory, 'referent');
    const link = join(directory, 'output');
    await writeFile(referent, 'private');
    await symlink(referent, link);

    expect(() => writeFileAtomicallySync(link, 'replacement')).toThrow(
      'Atomic file target must be a regular file'
    );
    expect(await readFile(referent, 'utf8')).toBe('private');
  });
});
