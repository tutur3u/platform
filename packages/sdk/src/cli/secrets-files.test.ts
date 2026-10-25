import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_SECRET_BYTES,
  readCredentialsFile,
  readSourceFile,
  SecretsFileError,
  wipe,
  writePrivateFile,
} from './secrets-files';

let dir: string;
beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'ttr-secrets-files-')));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function reason(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    expect(error).toBeInstanceOf(SecretsFileError);
    return (error as SecretsFileError).reason;
  }
  return 'resolved';
}

describe('readSourceFile', () => {
  it('round-trips every byte value and reads at the size limit', async () => {
    const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    await writeFile(join(dir, 'all'), all);
    expect((await readSourceFile(join(dir, 'all'))).equals(all)).toBe(true);
    const max = randomBytes(MAX_SECRET_BYTES);
    await writeFile(join(dir, 'max'), max);
    expect((await readSourceFile(join(dir, 'max'))).equals(max)).toBe(true);
  });

  it('refuses empty, oversized, missing, directory, symlink and FIFO sources', async () => {
    await writeFile(join(dir, 'empty'), '');
    await writeFile(join(dir, 'big'), Buffer.alloc(MAX_SECRET_BYTES + 1));
    await writeFile(join(dir, 'real'), 'synthetic');
    await symlink(join(dir, 'real'), join(dir, 'link'));
    await symlink(join(dir, 'gone'), join(dir, 'dangling'));
    await mkdir(join(dir, 'folder'));
    execFileSync('mkfifo', [join(dir, 'fifo')]);
    expect(await reason(readSourceFile(join(dir, 'empty')))).toBe('empty');
    expect(await reason(readSourceFile(join(dir, 'big')))).toBe('too-large');
    expect(await reason(readSourceFile(join(dir, 'gone')))).toBe('unreadable');
    expect(await reason(readSourceFile(join(dir, 'folder')))).toBe(
      'not-regular'
    );
    expect(await reason(readSourceFile(join(dir, 'link')))).toBe('not-regular');
    expect(await reason(readSourceFile(join(dir, 'dangling')))).toBe(
      'not-regular'
    );
    // Must fail fast rather than block waiting for a writer.
    expect(await reason(readSourceFile(join(dir, 'fifo')))).toBe('not-regular');
  });

  it('does not put the path in any error message', async () => {
    const error = await readSourceFile(join(dir, 'marker-path-xyz')).catch(
      (e: Error) => e
    );
    expect((error as Error).message).not.toContain('marker-path-xyz');
  });
});

describe('readCredentialsFile', () => {
  it('requires an owner-only single-link regular file', async () => {
    const file = join(dir, 'credentials.json');
    await writeFile(file, '{}', { mode: 0o600 });
    expect((await readCredentialsFile(file)).toString()).toBe('{}');
    for (const mode of [0o640, 0o604, 0o644, 0o660, 0o666]) {
      await chmod(file, mode);
      expect(await reason(readCredentialsFile(file))).toBe(
        'unsafe-permissions'
      );
    }
    await chmod(file, 0o600);
    await link(file, join(dir, 'second-name'));
    expect(await reason(readCredentialsFile(file))).toBe('unsafe-permissions');
    await symlink(file, join(dir, 'via-link'));
    expect(await reason(readCredentialsFile(join(dir, 'via-link')))).toBe(
      'not-regular'
    );
  });

  it('refuses credential files larger than 16 KiB', async () => {
    await writeFile(join(dir, 'big'), Buffer.alloc(16 * 1024 + 1), {
      mode: 0o600,
    });
    expect(await reason(readCredentialsFile(join(dir, 'big')))).toBe(
      'too-large'
    );
  });
});

describe('writePrivateFile', () => {
  it('creates a mode 0600 file and leaves no temporary files', async () => {
    const bytes = randomBytes(4096);
    await writePrivateFile(join(dir, 'out'), bytes);
    expect((await stat(join(dir, 'out'))).mode & 0o777).toBe(0o600);
    expect((await readFile(join(dir, 'out'))).equals(bytes)).toBe(true);
    expect(await readdir(dir)).toEqual(['out']);
  });

  it('refuses to overwrite without replace and keeps the original', async () => {
    await writeFile(join(dir, 'out'), 'original');
    expect(
      await reason(writePrivateFile(join(dir, 'out'), Buffer.from('new')))
    ).toBe('exists');
    expect(await readFile(join(dir, 'out'), 'utf8')).toBe('original');
    expect(await readdir(dir)).toEqual(['out']);
  });

  it('replaces atomically and resets the mode to 0600', async () => {
    await writeFile(join(dir, 'out'), 'original', { mode: 0o644 });
    const before = (await stat(join(dir, 'out'))).ino;
    await writePrivateFile(join(dir, 'out'), Buffer.from('new'), {
      replace: true,
    });
    const after = await stat(join(dir, 'out'));
    expect(after.ino).not.toBe(before);
    expect(after.mode & 0o777).toBe(0o600);
    expect(await readFile(join(dir, 'out'), 'utf8')).toBe('new');
    expect(await readdir(dir)).toEqual(['out']);
  });

  it('never follows or replaces a symlink, with or without replace', async () => {
    await writeFile(join(dir, 'victim'), 'victim-data');
    await symlink(join(dir, 'victim'), join(dir, 'link'));
    await symlink(join(dir, 'missing'), join(dir, 'dangling'));
    for (const replace of [false, true]) {
      for (const name of ['link', 'dangling']) {
        expect(
          await reason(
            writePrivateFile(join(dir, name), Buffer.from('x'), { replace })
          )
        ).toBe('unsafe-output');
      }
    }
    expect(await readFile(join(dir, 'victim'), 'utf8')).toBe('victim-data');
    expect((await lstat(join(dir, 'link'))).isSymbolicLink()).toBe(true);
    await expect(lstat(join(dir, 'missing'))).rejects.toThrow();
  });

  it('refuses directories, FIFOs and a missing parent directory', async () => {
    await mkdir(join(dir, 'folder'));
    execFileSync('mkfifo', [join(dir, 'fifo')]);
    for (const name of ['folder', 'fifo'])
      expect(
        await reason(
          writePrivateFile(join(dir, name), Buffer.from('x'), { replace: true })
        )
      ).toBe('unsafe-output');
    expect(
      await reason(writePrivateFile(join(dir, 'nope', 'out'), Buffer.from('x')))
    ).toBe('unsafe-output');
  });

  it('writes through a symlinked parent directory by resolving it first', async () => {
    await mkdir(join(dir, 'real'));
    await symlink(join(dir, 'real'), join(dir, 'alias'));
    await writePrivateFile(join(dir, 'alias', 'out'), Buffer.from('ok'));
    expect(await readFile(join(dir, 'real', 'out'), 'utf8')).toBe('ok');
  });

  it('refuses values over the size limit', async () => {
    expect(
      await reason(
        writePrivateFile(join(dir, 'out'), Buffer.alloc(MAX_SECRET_BYTES + 1))
      )
    ).toBe('too-large');
  });
});

it('wipe zeroes buffers and tolerates undefined', () => {
  const buffer = Buffer.from('synthetic');
  wipe(buffer, undefined);
  expect(buffer.every((byte) => byte === 0)).toBe(true);
});
