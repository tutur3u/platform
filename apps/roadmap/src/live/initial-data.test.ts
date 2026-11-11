/** D79: the live snapshot must never be parsed while a Worker module evaluates. */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import generated from '../generated/live.json' with { type: 'json' };
import { parseLiveData } from './model.ts';

describe('live snapshot parsing and the Workers clock', () => {
  it('broken variant: parsing with the module-evaluation clock (0) throws', () => {
    assert.throws(
      () => parseLiveData(generated, 0),
      /Observation time is in the future/
    );
  });

  it('importing the helper with Date.now() = 0 does not parse anything', async () => {
    const real = Date.now;
    Date.now = () => 0;
    try {
      const { initialLiveData } = await import(
        `./initial-data.ts?zero-clock=${Math.random()}`
      );
      Date.now = real;
      assert.equal(
        initialLiveData().generatedAt,
        parseLiveData(generated).generatedAt
      );
    } finally {
      Date.now = real;
    }
  });

  it('no route or page module parses live data at top level', () => {
    const files = ['../routes/', '../pages/'].flatMap((dir) => {
      const root = new URL(dir, import.meta.url);
      return readdirSync(root, { recursive: true })
        .map(String)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => new URL(file, root));
    });
    assert.ok(files.length >= 6);
    for (const url of files) {
      const file = url.pathname.split('/src/')[1] ?? url.pathname;
      const source = readFileSync(url, 'utf8');
      assert.doesNotMatch(
        source,
        /^(?:const|let|var)[^\n]*\b(?:parseLiveData|initialLiveData)\(/m,
        file
      );
      assert.doesNotMatch(
        source,
        /generated\/live\.json/,
        `${file} imports the snapshot directly`
      );
    }
  });

  it('both pages build their previews from their own og image', () => {
    for (const file of ['../pages/roadmap.tsx', '../pages/edufest.tsx']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      assert.match(
        source,
        /import ogImage from '\.\.\/assets\/og-[a-z0-9-]+\.png\?no-inline';/,
        file
      );
      assert.match(source, /socialMeta\(\{[\s\S]*image: ogImage,/, file);
    }
  });
});
