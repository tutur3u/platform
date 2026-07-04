import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getSupabaseBinaryPath } from './run-supabase.js';

async function createFakeWorkspace(t, { withSupabaseGo = true } = {}) {
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

  if (!withSupabaseGo) {
    return { supabaseGoPath: null, wrapperPath, workspaceDir };
  }

  const supabaseGoPackageDir = path.join(
    workspaceDir,
    'node_modules',
    '@supabase',
    'cli-darwin-arm64'
  );
  const supabaseGoPath = path.join(supabaseGoPackageDir, 'bin', 'supabase-go');

  await mkdir(path.dirname(supabaseGoPath), { recursive: true });
  await writeFile(
    path.join(supabaseGoPackageDir, 'package.json'),
    JSON.stringify({ name: '@supabase/cli-darwin-arm64' })
  );
  await writeFile(supabaseGoPath, '#!/bin/sh\n');

  return { supabaseGoPath, wrapperPath, workspaceDir };
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

test('getSupabaseBinaryPath prefers bundled supabase-go when available', async (t) => {
  const { supabaseGoPath, workspaceDir } = await createFakeWorkspace(t);

  assert.equal(
    getSupabaseBinaryPath(workspaceDir, {
      arch: 'arm64',
      env: {},
      platform: 'darwin',
    }),
    fs.realpathSync(supabaseGoPath)
  );
});

test('getSupabaseBinaryPath falls back to the package wrapper', async (t) => {
  const { workspaceDir, wrapperPath } = await createFakeWorkspace(t, {
    withSupabaseGo: false,
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
