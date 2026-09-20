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
