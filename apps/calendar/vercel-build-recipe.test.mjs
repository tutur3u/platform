import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = (name) =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));

test('Vercel builds shared suppliers then the retained Next frontend', () => {
  const config = readJson('./vercel.json');
  const pkg = readJson('./package.json');
  assert.equal(
    config.buildCommand,
    "cd ../.. && bun turbo:local run build --filter='@tuturuuu/calendar^...' && bun run --cwd apps/calendar build:legacy"
  );
  assert.equal(pkg.scripts['build:legacy'], 'next build --turbopack');
  assert.equal(pkg.scripts.build, 'vp build');
  assert.equal(config.git.deploymentEnabled, false);
  assert.equal(config.github.enabled, false);
});
