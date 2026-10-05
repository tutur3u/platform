import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { stageLocalInferenceMacos } from './stage-local-inference-macos.mjs';

async function fixture(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'mira-native-stage-'));
  await mkdir(join(directory, '.dart_tool'));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('missing runtime never executes a staging fallback', () =>
  fixture(async (mobileRoot) => {
    await writeFile(
      join(mobileRoot, '.dart_tool/package_config.json'),
      JSON.stringify({ packages: [] })
    );
    await assert.rejects(
      stageLocalInferenceMacos('/unused.app', {
        mobileRoot,
        run: () => assert.fail('must not execute'),
      }),
      /Pinned local inference runtime is missing/
    );
  }));

test('modified third-party script is rejected before execution or signing', () =>
  fixture(async (mobileRoot) => {
    const runtime = join(mobileRoot, 'runtime');
    await mkdir(join(runtime, 'tool'), { recursive: true });
    await writeFile(
      join(runtime, 'tool/stage_macos_companions.sh'),
      '#!/bin/sh\nexit 0\n'
    );
    await writeFile(
      join(mobileRoot, '.dart_tool/package_config.json'),
      JSON.stringify({
        packages: [
          {
            name: 'flutter_edge_ai_litertlm',
            rootUri: pathToFileURL(`${runtime}/`).href,
          },
        ],
      })
    );
    await assert.rejects(
      stageLocalInferenceMacos('/unused.app', {
        mobileRoot,
        run: () => assert.fail('must not execute'),
      }),
      /Local inference staging script integrity mismatch/
    );
  }));
