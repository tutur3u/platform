// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { runtimeExpectationProblems } from '../../../../scripts/start-bridge-codemod/runtime-outcome.mjs';

it('declares Pay outcomes using the shared runtime manifest contract', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../../start-bridge.routes.json', import.meta.url),
      'utf8'
    )
  );
  expect(runtimeExpectationProblems(manifest.runtime)).toEqual([]);
});
