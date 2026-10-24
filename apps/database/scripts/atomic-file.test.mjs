import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeFileAtomically } from './atomic-file.js';

async function withDirectory(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'atomic-file-test-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('replaces a regular file atomically and retains its permissions', async () =>
  withDirectory(async (directory) => {
    const target = path.join(directory, 'target.json');
    await writeFile(target, 'before', { mode: 0o640 });

    await writeFileAtomically(target, 'after');

    assert.equal(await readFile(target, 'utf8'), 'after');
    assert.equal((await stat(target)).mode & 0o777, 0o640);
  }));

test('refuses a symlink target and leaves its referent unchanged', async () =>
  withDirectory(async (directory) => {
    const referent = path.join(directory, 'referent');
    const target = path.join(directory, 'target');
    await writeFile(referent, 'protected');
    await symlink(referent, target);

    await assert.rejects(writeFileAtomically(target, 'replacement'));

    assert.equal(await readFile(referent, 'utf8'), 'protected');
  }));

test('cleans its exclusive temporary file when pre-rename validation fails', async () =>
  withDirectory(async (directory) => {
    const target = path.join(directory, 'target');
    await writeFile(target, 'before');

    await assert.rejects(
      writeFileAtomically(target, 'after', {
        beforeMove: () => {
          throw new Error('validation failed');
        },
      }),
      /validation failed/
    );

    assert.equal(await readFile(target, 'utf8'), 'before');
    assert.deepEqual(
      await (await import('node:fs/promises')).readdir(directory),
      ['target']
    );
  }));

test('exclusive destinations remain exclusive at the atomic publication step', async () =>
  withDirectory(async (directory) => {
    const target = path.join(directory, 'metadata.json');
    await writeFile(target, 'existing');

    await assert.rejects(
      writeFileAtomically(target, 'replacement', {
        writeOptions: { flag: 'wx', mode: 0o600 },
      })
    );

    assert.equal(await readFile(target, 'utf8'), 'existing');
  }));
