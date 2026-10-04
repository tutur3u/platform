const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReleaseNotes } = require('./normalize-release-notes');

const hash = 'a'.repeat(40);
const second = 'b'.repeat(40);
const commit = (value) =>
  `([${value.slice(0, 7)}](https://github.com/tutur3u/platform/commit/${value}))`;
const issue = '([#42](https://github.com/tutur3u/platform/issues/42))';
const old = `## [1.0.0](https://example.test/old)\n\n* Already published ${commit(hash)}\n* Already published ${commit(second)}\n`;
const header =
  '# Changelog\n\n## [1.1.0](https://example.test/new)\n\n### Fixes\n';

test('combines repeated descriptions while retaining all source references', () => {
  const input = `${header}* **mail:** repair cache ${commit(hash)}\n* **mail:** repair cache ${issue} ${commit(second)}\n\n${old}`;
  const result = normalizeReleaseNotes(input, `# Changelog\n\n${old}`);
  assert.equal(
    result,
    `${header}* **mail:** repair cache ${commit(hash)} ${issue} ${commit(second)}\n\n${old}`
  );
  assert.equal(normalizeReleaseNotes(result, old), result);
});

test('does not deduplicate across release sections or change published history', () => {
  const input = `${header}* Same ${commit(hash)}\n### Features\n* Same ${commit(second)}\n${old}`;
  assert.equal(normalizeReleaseNotes(input, old), input);
});

test('keeps distinct descriptions and unfamiliar trailing content', () => {
  const input = `${header}* First ${commit(hash)}\n* Second ${commit(second)}\n* First ${commit(second)} Additional detail\n${old}`;
  assert.equal(normalizeReleaseNotes(input, old), input);
});

test('removes only confirmed integration commits in unpublished additions', () => {
  const input = `${header}* Integration ${commit(hash)}\n* Real fix ${commit(second)}\n${old}`;
  assert.equal(
    normalizeReleaseNotes(input, old, (value) => value === hash),
    `${header}* Real fix ${commit(second)}\n${old}`
  );
});

test('retains combined entries containing any functional commit', () => {
  const input = `${header}* Mixed ${commit(hash)} ${commit(second)}\n${old}`;
  assert.equal(
    normalizeReleaseNotes(input, old, (value) => value === hash),
    input
  );
});

test('fails closed when published history cannot be located', () => {
  assert.throws(
    () => normalizeReleaseNotes(header, old),
    /boundary is missing/
  );
});

test('supports an initial release with no previous headings', () => {
  const input = `${header}* Fix ${commit(hash)}\n* Fix ${commit(hash)}\n`;
  assert.equal(
    normalizeReleaseNotes(input, '# Changelog\n'),
    `${header}* Fix ${commit(hash)}\n`
  );
});

test('omits known Git bookkeeping in new notes but preserves published originals and product merges', () => {
  const input = `${header}* **mobile:** Merge remote-tracking branch 'origin/main' ${commit(hash)}\n* **contacts:** merge duplicate contacts ${commit(second)}\n${old}`;
  assert.equal(
    normalizeReleaseNotes(input, old),
    `${header}* **contacts:** merge duplicate contacts ${commit(second)}\n${old}`
  );
});

const offlineHash = 'a45d63498cc1e686d1d070f5861cf938c4e9a9ef';
const offlineMerge = '2f0f39763daea56f1029fcc3e99e0be53c60e106';
const offlineTitle =
  '* **mobile:** support offline data and safe inventory checkout';
const offlineMergeTitle =
  '* **mobile:** support offline data, cached images, and safe inventory checkout';

test('consolidates only the proven #5734 source and merge pair in either order', () => {
  const original = `${offlineTitle} ${commit(offlineHash)}`;
  const merge = `${offlineMergeTitle} ${issue} ${commit(offlineMerge)}`;
  for (const reverse of [false, true]) {
    const lines = reverse ? [merge, original] : [original, merge];
    const result = normalizeReleaseNotes(
      `${header}${lines.join('\n')}\n${old}`,
      old
    );
    const references = reverse
      ? `${issue} ${commit(offlineMerge)} ${commit(offlineHash)}`
      : `${commit(offlineHash)} ${issue} ${commit(offlineMerge)}`;
    assert.equal(result, `${header}${offlineMergeTitle} ${references}\n${old}`);
    assert.equal(normalizeReleaseNotes(result, old), result);
  }
});

test('does not infer equivalent releases from similar titles or unrelated hashes', () => {
  for (const [left, right] of [
    [hash, offlineMerge],
    [offlineHash, second],
    [offlineHash, offlineHash],
  ]) {
    const input = `${header}${offlineTitle} ${commit(left)}\n${offlineMergeTitle} ${commit(right)}\n${old}`;
    assert.equal(normalizeReleaseNotes(input, old), input);
  }
  const standalone = `${header}${offlineTitle} ${commit(offlineHash)}\n${old}`;
  assert.equal(normalizeReleaseNotes(standalone, old), standalone);
});

test('keeps the proven mobile pair separate across sections and published history', () => {
  const source = `${offlineTitle} ${commit(offlineHash)}`;
  const merge = `${offlineMergeTitle} ${commit(offlineMerge)}`;
  const separated = `${header}${source}\n### Features\n${merge}\n${old}`;
  assert.equal(normalizeReleaseNotes(separated, old), separated);
  const published = `## [1.0.0](https://example.test/old)\n${source}\n${merge}\n`;
  const input = `${header}${source}\n${published}`;
  assert.equal(normalizeReleaseNotes(input, published), input);
});
