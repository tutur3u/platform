import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { build } from 'vite';

test('patch notes render through the real parser, including fallback, model and invalid inputs', async (t) => {
  const app = new URL('../', import.meta.url).pathname;
  const root = mkdtempSync(join(app, '.render-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'entry.tsx'),
    `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PatchNotes } from '../src/components/insights/patch-notes';
import { parseChangelog } from '../src/changelog/schema';
import en from '../messages/en.json';
export const render = raw => renderToStaticMarkup(<PatchNotes t={en} lang="en" changelog={parseChangelog(raw)} />);
`
  );
  await build({
    configFile: false,
    root: app,
    logLevel: 'silent',
    esbuild: { jsx: 'automatic' },
    build: {
      ssr: join(root, 'entry.tsx'),
      rollupOptions: { output: { entryFileNames: 'render.js' } },
      outDir: join(root, 'out'),
    },
  });
  const { render } = await import(pathToFileURL(join(root, 'out/render.js')));
  const fixture = JSON.parse(
    readFileSync(
      new URL('../src/changelog/fixtures/changelog.json', import.meta.url),
      'utf8'
    )
  );
  const html = render(fixture);
  assert.match(html, /patch-notes/);
  assert.match(html, /Fallback/);
  assert.doesNotMatch(html, /Fixture item one/);
  assert.doesNotMatch(html, /release-summary/);
  assert.match(html, /13 Nov/);
  assert.equal(render(null), '');
  assert.equal(render({ ...fixture, schema: 2 }), '');
  assert.equal(render({ ...fixture, releases: [] }), '');
  assert.match(
    render({ ...fixture, mode: 'llm', model: 'test-model' }),
    /test-model/
  );
  const broken = structuredClone(fixture);
  broken.releases[0].summary.en = '<b>markup</b>';
  assert.equal(render(broken), '');
  assert.doesNotMatch(
    render({ ...fixture, mode: 'llm', model: 'test-model' }),
    /Fallback/
  );
});
