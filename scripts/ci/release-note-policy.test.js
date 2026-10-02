const assert = require('node:assert/strict');
const { test } = require('node:test');
const fixtures = require('./release-note-policy.fixture.json');
const {
  isReleaseBookkeeping,
  filterReleaseBookkeeping,
} = require('./release-note-policy');

for (const { subject, bookkeeping } of fixtures) {
  test(`classifies ${subject}`, () =>
    assert.equal(isReleaseBookkeeping(subject), bookkeeping));
}

test('filters only bookkeeping bullet lines and preserves product prose', () => {
  const input =
    "Please test 0.22.0:\n- Merge remote-tracking branch 'origin/main'\n- merge duplicate contacts\n- Sync calendar events to Google";
  assert.equal(
    filterReleaseBookkeeping(input),
    'Please test 0.22.0:\n- merge duplicate contacts\n- Sync calendar events to Google'
  );
});

test('recognizes tracking subjects carrying generated source references', () => {
  assert.equal(
    isReleaseBookkeeping(
      "Merge remote-tracking branch 'origin/main' ([abc1234](https://github.com/tutur3u/platform/commit/abc1234))"
    ),
    true
  );
});
