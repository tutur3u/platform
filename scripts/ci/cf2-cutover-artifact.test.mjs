import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { packCutover, prepareCutover } from './cf2-cutover-artifact.mjs';

const { fixture } = createRequire(import.meta.url)(
  './wave1-native-test-fixture.cjs'
);
const sha = 'a'.repeat(40);
for (const app of ['mail', 'apps']) {
  test(`${app}: pack only the sealed source and config`, (t) => {
    const root = fixture(t, app);
    const receipt = prepareCutover(root, app, sha);
    const config = JSON.parse(readFileSync(join(root, receipt.config), 'utf8'));
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    packCutover(root, app, sha, join(root, 'packed'));
    assert.match(
      readFileSync(join(root, 'packed', `${app}-${sha}.tar.gz.sha256`), 'utf8'),
      /^[a-f0-9]{64} {2}/u
    );
    writeFileSync(join(root, 'dist/server/index.js'), 'drift');
    assert.throws(
      () => packCutover(root, app, sha, join(root, 'packed')),
      /Sealed bytes changed/
    );
  });
}
for (const mutation of ['main', 'assets', 'key', 'pointer']) {
  test(`refuse unsafe ${mutation} before preparing`, (t) => {
    const root = fixture(t);
    const file = join(root, 'dist/server/wrangler.json');
    const config = JSON.parse(readFileSync(file, 'utf8'));
    if (mutation === 'main') config.main = '../../../package.json';
    if (mutation === 'assets') config.assets.directory = '../../..';
    if (mutation === 'key') config.unreviewed = {};
    writeFileSync(file, JSON.stringify(config));
    if (mutation === 'pointer')
      writeFileSync(
        join(root, '.wrangler/deploy/config.json'),
        JSON.stringify({
          configPath: '../../dist/server/wrangler.json',
          auxiliaryWorkers: [],
          extra: true,
        })
      );
    assert.throws(() => prepareCutover(root, 'mail', sha));
  });
}
