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

  it('no route module parses live data at top level', () => {
    const root = new URL('../routes/', import.meta.url);
    const files = readdirSync(root, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.tsx'));
    assert.ok(files.length >= 2);
    for (const file of files) {
      const source = readFileSync(new URL(file, root), 'utf8');
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

  it('both pages declare an absolute og:image and a large Twitter card', () => {
    for (const file of [
      '../routes/index.tsx',
      '../routes/workshops/edufest-2026.tsx',
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      assert.match(
        source,
        /property: 'og:image', content: `https:\/\/tuturuuu\.com\$\{ogImage\}`/,
        file
      );
      assert.match(
        source,
        /name: 'twitter:card', content: 'summary_large_image'/,
        file
      );
    }
  });
});
