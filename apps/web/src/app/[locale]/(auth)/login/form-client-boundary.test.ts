import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps the login client directive as the first statement before imports', () => {
  const source = readFileSync(new URL('./form.tsx', import.meta.url), 'utf8');
  expect(source.trimStart()).toMatch(/^(['"])use client\1;/);
});
