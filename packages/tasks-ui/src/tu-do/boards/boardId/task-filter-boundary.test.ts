import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('declares the task filter client boundary before imports as a literal directive', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, 'task-filter.tsx'),
    'utf8'
  );
  expect(source.trimStart()).toMatch(/^(['"])use client\1;\s+import\b/);
});
