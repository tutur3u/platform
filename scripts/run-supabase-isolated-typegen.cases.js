import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  APPROVED_TYPEGEN_OUTPUT,
  generateTypesFromDisposableStack,
  validateTypegenOutputPath,
  writeTypegenOutputAtomically,
} from '../apps/database/scripts/run-supabase-isolated-typegen.js';

async function temporaryDirectory(t) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'isolated-typegen-repo-')
  );
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function fakeMetadata(disposableRoot) {
  return {
    disposableRoot,
    repositoryRoot: '/repo',
    typegenOutput: APPROVED_TYPEGEN_OUTPUT,
  };
}

test('typegen output accepts only the real approved repository file', async (t) => {
  const root = await temporaryDirectory(t);
  const parent = path.join(root, 'packages/types/src');
  await mkdir(parent, { recursive: true });
  await writeFile(path.join(parent, 'supabase.ts'), 'old types\n');

  assert.equal(
    validateTypegenOutputPath(root, APPROVED_TYPEGEN_OUTPUT),
    APPROVED_TYPEGEN_OUTPUT
  );
  assert.throws(
    () => validateTypegenOutputPath(root, 'packages/types/src/../supabase.ts'),
    /must be exactly/
  );
  assert.throws(
    () => validateTypegenOutputPath(root, '/tmp/supabase.ts'),
    /must be exactly/
  );

  fs.rmSync(path.join(parent, 'supabase.ts'));
  fs.symlinkSync('/tmp', path.join(parent, 'supabase.ts'));
  assert.throws(
    () => validateTypegenOutputPath(root, APPROVED_TYPEGEN_OUTPUT),
    /regular file/
  );
  fs.rmSync(path.join(parent, 'supabase.ts'));
  fs.mkdirSync(path.join(parent, 'supabase.ts'));
  assert.throws(
    () => validateTypegenOutputPath(root, APPROVED_TYPEGEN_OUTPUT),
    /regular file/
  );

  const symlinkedRoot = await temporaryDirectory(t);
  await mkdir(path.join(symlinkedRoot, 'packages/types'), { recursive: true });
  fs.symlinkSync('/tmp', path.join(symlinkedRoot, 'packages/types/src'));
  assert.throws(
    () => validateTypegenOutputPath(symlinkedRoot, APPROVED_TYPEGEN_OUTPUT),
    /not a real directory/
  );
});

test('typegen output replacement is atomic, repeatable, and rejects empty output', async (t) => {
  const root = await temporaryDirectory(t);
  const target = path.join(root, APPROVED_TYPEGEN_OUTPUT);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, 'original\n');

  await writeTypegenOutputAtomically(
    root,
    APPROVED_TYPEGEN_OUTPUT,
    Buffer.from('generated one\n')
  );
  await writeTypegenOutputAtomically(
    root,
    APPROVED_TYPEGEN_OUTPUT,
    Buffer.from('generated two\n')
  );
  assert.equal(await readFile(target, 'utf8'), 'generated two\n');

  await assert.rejects(
    writeTypegenOutputAtomically(
      root,
      APPROVED_TYPEGEN_OUTPUT,
      Buffer.from('  \n')
    ),
    /empty output/
  );
  assert.equal(await readFile(target, 'utf8'), 'generated two\n');
  assert.deepEqual(
    fs
      .readdirSync(path.dirname(target))
      .filter((name) => name.endsWith('.tmp')),
    []
  );

  await assert.rejects(
    writeTypegenOutputAtomically(
      root,
      APPROVED_TYPEGEN_OUTPUT,
      Buffer.from('uncommitted output\n'),
      {
        move: async () => {
          throw new Error('atomic move unavailable');
        },
      }
    ),
    /atomic move unavailable/
  );
  assert.equal(await readFile(target, 'utf8'), 'generated two\n');
  assert.deepEqual(
    fs
      .readdirSync(path.dirname(target))
      .filter((name) => name.endsWith('.tmp')),
    []
  );
});

test('typegen uses the pinned binary and disposable workdir', async () => {
  const metadata = fakeMetadata('/tmp/tuturuuu-supabase-typegen-command');
  const calls = [];
  let written = null;
  await generateTypesFromDisposableStack({
    binaryPath: '/pinned/supabase',
    metadata,
    runner: async (command, args, cwd) => {
      calls.push({ args, command, cwd });
      return {
        code: 0,
        signal: null,
        stdout: Buffer.from('generated schema output\n'),
      };
    },
    writer: async (...args) => {
      written = args;
    },
  });

  assert.deepEqual(calls, [
    {
      args: [
        '--workdir',
        metadata.disposableRoot,
        'gen',
        'types',
        'typescript',
        '--local',
        '--schema',
        'public,private,storage',
      ],
      command: '/pinned/supabase',
      cwd: metadata.disposableRoot,
    },
  ]);
  assert.equal(written[0], metadata.repositoryRoot);
  assert.equal(written[1], APPROVED_TYPEGEN_OUTPUT);
  assert.equal(written[2].toString(), 'generated schema output\n');
});

test('typegen failure and writer failure never expose buffered output', async () => {
  const metadata = fakeMetadata('/tmp/tuturuuu-supabase-typegen-failure');
  let writerCalled = false;
  await assert.rejects(
    generateTypesFromDisposableStack({
      binaryPath: '/supabase',
      metadata,
      runner: async () => ({
        code: 23,
        signal: null,
        stdout: Buffer.from('sensitive buffered output'),
      }),
      writer: async () => {
        writerCalled = true;
      },
    }),
    (error) => error.exitCode === 23 && !error.message.includes('sensitive')
  );
  assert.equal(writerCalled, false);

  await assert.rejects(
    generateTypesFromDisposableStack({
      binaryPath: '/supabase',
      metadata,
      runner: async () => ({ code: 0, stdout: Buffer.from('types\n') }),
      writer: async () => {
        throw new Error('write unavailable');
      },
    }),
    /write unavailable/
  );
});
