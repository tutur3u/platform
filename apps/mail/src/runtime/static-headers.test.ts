import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const headers = readFileSync(
  resolve(__dirname, '../../public/_headers'),
  'utf8'
);

it('caches only fingerprinted /assets/* as immutable', () => {
  const rules = headers
    .split(/\n(?=\S)/u)
    .map((block) => block.trim())
    .filter(Boolean);
  expect(rules).toEqual([
    '/assets/*\n  Cache-Control: public,max-age=31536000,immutable',
  ]);
});
