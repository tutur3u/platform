import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

// sw.ts registers listeners on import, so its configuration is read as source.
const source = readFileSync(join(import.meta.dirname, 'sw.ts'), 'utf8');

test('the Tasks worker never answers the Mastermind mount', () => {
  expect(source).toMatch(/strictBypassPathPrefixes: \['\/mastermind'\]/u);
  // Navigations come from the network; only the offline page answers a
  // failed one, rebuilt with safe headers by the shared worker.
  expect(source).toMatch(/cacheNavigations: false/u);
});
