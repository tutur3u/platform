import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNameForBuild } from './build-name.mjs';

test('derives a unique patch from each store build number', () => {
  const pubspec = 'name: mobile\nversion: 0.11.0+84\n';
  assert.equal(buildNameForBuild(pubspec, 203001), '0.11.203001');
  assert.equal(buildNameForBuild(pubspec, 203002), '0.11.203002');
  assert.equal(
    buildNameForBuild('version: 0.12.0+85\n', 204001),
    '0.12.204001'
  );
});

test('rejects invalid build inputs', () => {
  assert.throws(() => buildNameForBuild('version: 0.11.0+84', 0));
  assert.throws(() => buildNameForBuild('version: 0.11.0+84', '1;rm'));
  assert.throws(() => buildNameForBuild('version: unexpected', 203001));
});
