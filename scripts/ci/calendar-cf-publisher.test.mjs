import assert from 'node:assert/strict';
import test from 'node:test';
import { assertUploadNameParity } from './calendar-cf-publisher.mjs';

test('upload name parity normalizes secondary modules to cf ./ paths', () => {
  const receipt = {
    secondaryModuleNames: [
      { source: 'nested/chunk.js', cfUpload: './nested/chunk.js' },
    ],
  };
  assert.doesNotThrow(() =>
    assertUploadNameParity(receipt, ['nested/chunk.js'])
  );
  assert.throws(
    () => assertUploadNameParity(receipt, ['other.js']),
    /Wrangler dry-run modules differ/
  );
});
