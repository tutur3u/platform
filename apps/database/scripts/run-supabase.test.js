import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getSupabaseBinaryPath } from './run-supabase.js';

async function createFakeWorkspace(t, { binaryNames = ['supabase'] } = {}) {
  const workspaceDir = await mkdtemp(
    path.join(os.tmpdir(), 'run-supabase-test-')
  );
  t.after(() => fs.rmSync(workspaceDir, { force: true, recursive: true }));

  const supabasePackageDir = path.join(
    workspaceDir,
    'node_modules',
    'supabase'
  );
  const wrapperPath = path.join(supabasePackageDir, 'dist', 'supabase.js');

  await mkdir(path.dirname(wrapperPath), { recursive: true });
  await writeFile(
    path.join(supabasePackageDir, 'package.json'),
    JSON.stringify({ bin: { supabase: 'dist/supabase.js' } })
  );
  await writeFile(wrapperPath, '#!/usr/bin/env node\n');

  const supabaseCliPackageDir = path.join(
    workspaceDir,
    'node_modules',
    '@supabase',
    'cli-darwin-arm64'
  );

  await mkdir(path.join(supabaseCliPackageDir, 'bin'), { recursive: true });
  await writeFile(
    path.join(supabaseCliPackageDir, 'package.json'),
    JSON.stringify({ name: '@supabase/cli-darwin-arm64' })
  );

  const bundledBinaryPaths = [];
  for (const binaryName of binaryNames) {
    const binaryPath = path.join(supabaseCliPackageDir, 'bin', binaryName);
    await writeFile(binaryPath, '#!/bin/sh\n');
    bundledBinaryPaths.push(binaryPath);
  }

  return { bundledBinaryPaths, wrapperPath, workspaceDir };
}

test('getSupabaseBinaryPath honors explicit binary override', async (t) => {
  const { workspaceDir } = await createFakeWorkspace(t);
  const overridePath = '/tmp/custom-supabase';

  assert.equal(
    getSupabaseBinaryPath(workspaceDir, {
      arch: 'arm64',
      env: { SUPABASE_CLI_BINARY_OVERRIDE: overridePath },
      platform: 'darwin',
    }),
    overridePath
  );
});

test('getSupabaseBinaryPath prefers the bundled supabase binary', async (t) => {
  const { bundledBinaryPaths, workspaceDir } = await createFakeWorkspace(t, {
    binaryNames: ['supabase', 'supabase-go'],
  });

  assert.equal(
    getSupabaseBinaryPath(workspaceDir, {
      arch: 'arm64',
      env: {},
      platform: 'darwin',
    }),
    fs.realpathSync(bundledBinaryPaths[0])
  );
});

test('getSupabaseBinaryPath supports the legacy supabase-go binary', async (t) => {
  const { bundledBinaryPaths, workspaceDir } = await createFakeWorkspace(t, {
    binaryNames: ['supabase-go'],
  });

  assert.equal(
    getSupabaseBinaryPath(workspaceDir, {
      arch: 'arm64',
      env: {},
      platform: 'darwin',
    }),
    fs.realpathSync(bundledBinaryPaths[0])
  );
});

test('getSupabaseBinaryPath falls back to the package wrapper', async (t) => {
  const { workspaceDir, wrapperPath } = await createFakeWorkspace(t, {
    binaryNames: [],
  });

  assert.equal(
    getSupabaseBinaryPath(workspaceDir, {
      arch: 'arm64',
      env: {},
      platform: 'darwin',
    }),
    wrapperPath
  );
});

test('startup drains large stderr under a piped parent and preserves exit codes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'supabase-piped-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'start'),
    `const fs = require('node:fs');
fs.writeFileSync(2, 'x'.repeat(512 * 1024));
fs.writeFileSync(1, 'complete');
process.exitCode = Number(process.argv[2]);
`
  );
  const wrapper = new URL('./run-supabase.js', import.meta.url).href;
  for (const code of [0, 23]) {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { runCommand } from ${JSON.stringify(wrapper)};
const result = await runCommand(process.execPath, ['start', '${code}'], ${JSON.stringify(root)});
process.exitCode = result.code;`,
      ],
      { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 }
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, code);
    assert.equal(result.stdout, 'complete');
    assert.equal(result.stderr, 'x'.repeat(512 * 1024));
  }
});
