import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const readJson = (name: string) =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));

test('Vercel builds shared suppliers then the retained Next frontend', () => {
  const config = readJson('./vercel.json');
  const pkg = readJson('./package.json');
  expect(config.buildCommand).toBe(
    "cd ../.. && bun turbo:local run build --filter='@tuturuuu/calendar^...' && bun run --cwd apps/calendar build:legacy"
  );
  expect(pkg.scripts['build:legacy']).toBe('next build --turbopack');
  expect(pkg.scripts.build).toBe('vp build');
  expect(config.git.deploymentEnabled).toBe(false);
  expect(config.github.enabled).toBe(false);
});
