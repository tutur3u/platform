import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const readJson = (name: string) =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));

test('Calendar declares the Worker and retained Next build commands', () => {
  const pkg = readJson('./package.json');
  expect(pkg.scripts['build:legacy']).toBe('next build --turbopack');
  expect(pkg.scripts.build).toBe('vp build');
});
