import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('Colab cannot fall back to Workers AI without a workspace-bound sponsorship', () => {
  const source = readFileSync(
    new URL('../apps/colab/src/server/ai.ts', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /env\.AI\.run\(/);
  assert.match(
    source,
    /return parseModelJson\(await sponsoredGeneration\(env, system, input, phase\)\)/
  );
});
