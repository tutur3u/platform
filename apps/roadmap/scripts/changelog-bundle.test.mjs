import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { build } from 'vite';
import { generateChangelog } from './generate-changelog.mjs';

function contains(directory, secret) {
  return readdirSync(directory, { withFileTypes: true }).some((entry) =>
    entry.isDirectory()
      ? contains(join(directory, entry.name), secret)
      : readFileSync(join(directory, entry.name)).includes(Buffer.from(secret))
  );
}
test('real Vite data-module bundle embeds parsed fallback and never the fake key; scanner rejects broken dist', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'changelog-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src/changelog'), { recursive: true });
  for (const file of ['data.ts', 'schema.ts'])
    cpSync(
      new URL(`../src/changelog/${file}`, import.meta.url),
      join(root, 'src/changelog', file)
    );
  const key = 'FAKE_KEY_NEVER_SHIP_321';
  await generateChangelog({
    directory: join(root, '.generated'),
    env: { GEMINI_API_KEY: key, GITHUB_EVENT_NAME: 'pull_request' },
    inputs: [
      {
        release: {
          number: 3,
          merge_commit_sha: 'a'.repeat(40),
          merged_at: '2026-11-03T00:00:00Z',
        },
        prs: [],
      },
    ],
    fetchImpl: () => assert.fail('PR network'),
  });
  await build({
    configFile: false,
    root,
    logLevel: 'silent',
    build: {
      lib: {
        entry: join(root, 'src/changelog/data.ts'),
        formats: ['es'],
        fileName: 'data',
      },
      outDir: 'dist',
    },
  });
  assert.equal(contains(join(root, 'dist'), key), false);
  assert.ok(contains(join(root, 'dist'), 'Production release #3'));
  writeFileSync(join(root, 'dist/broken.txt'), key);
  assert.equal(contains(join(root, 'dist'), key), true);
});
