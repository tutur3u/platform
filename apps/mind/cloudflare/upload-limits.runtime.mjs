import assert from 'node:assert/strict';
import { readdir, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';
import {
  assertUploadLimits,
  measureUpload,
} from '../../../scripts/ci/wave1-native-upload-limits.mjs';

const app = await realpath(fileURLToPath(new URL('../', import.meta.url)));

// A source map total above the provider limit fails an upload with error
// 10021 even when the Worker starts locally, so the emitted server carries no
// maps and its bytes are measured against the documented upload limits.
test('the emitted server stays inside the documented upload limits', async () => {
  const { configPath } = readNativeRuntimeConfig(app);
  const server = await realpath(dirname(configPath));
  const entries = await readdir(server, {
    recursive: true,
    withFileTypes: true,
  });
  const maps = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.map'))
    .map((entry) => join(entry.parentPath, entry.name));
  assert.deepEqual(maps, [], 'The emitted server must carry no source maps');
  const measured = assertUploadLimits(measureUpload(configPath, server, []));
  assert.equal(measured.sourcemaps.count, 0);
  assert.equal(measured.sourcemaps.encodedBytes, 0);
});
