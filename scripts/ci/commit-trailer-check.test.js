const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { checkMessages, hasCoauthoredBy } = require('./commit-trailer-check');

const DCO = 'Signed-off-by: vhpx <contact@vohoangphuc.com>';
const script = path.join(__dirname, 'commit-trailer-check.js');

test('a Co-authored-by trailer is rejected', () => {
  const message = `ci: add a check\n\n${DCO}\nCo-authored-by: Cursor <cursoragent@cursor.com>\n`;
  assert.equal(hasCoauthoredBy(message), true);
  assert.equal(checkMessages([message]).status, 1);
});

test('a DCO-only commit passes', () => {
  const message = `ci: add a check\n\nThe trailer policy stays in CI.\n\n${DCO}\n`;
  assert.equal(hasCoauthoredBy(message), false);
  assert.equal(checkMessages([message]).status, 0);
});

test('a prose mention is not a trailer and an empty batch fails closed', () => {
  const message = `ci: describe Co-authored-by policy\n\nThe body names Co-authored-by: someone without a trailer block.\n\n${DCO}\n`;
  assert.equal(hasCoauthoredBy(message), false);
  assert.equal(checkMessages([]).status, 1);
});

test('the CLI rejects one bad commit among passing ones', () => {
  const good = `ci: keep the DCO\n\n${DCO}\n`;
  const bad = `ci: add a partner\n\nCo-Authored-By: Other <other@example.com>\n`;
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    input: `${good}\0${bad}`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PR commit 2/);
  assert.doesNotMatch(result.stderr, /other@example.com/);
});
