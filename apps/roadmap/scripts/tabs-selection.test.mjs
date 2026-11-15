/**
 * The selected tab follows the URL through every way it changes, driven
 * through the real component (scripts/tabs-harness.mjs): a tab click, a
 * router navigation that fires no hashchange (a <Link hash>), a plain
 * fragment link, back and forward. Run with TABS_SOURCE_DIR to check
 * another copy of src/components (both earlier designs fail here).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mountTabs } from './tabs-harness.mjs';

test('tabs: an unknown fragment, a tab click, then Back shows Overview again', async () => {
  for (const start of ['garbage', '100%']) {
    const page = await mountTabs(start);
    assert.equal(page.selected(), 'overview', `#${start} on load`);
    assert.equal(page.click('progress'), 'progress', 'click Progress');
    assert.equal(page.location(), 'progress');
    assert.equal(page.back(), 'overview', `Back to #${start}`);
    assert.equal(page.forward(), 'progress', 'Forward');
  }
});

test('tabs: #progress, click Activity, Back shows Progress', async () => {
  const page = await mountTabs('progress');
  assert.equal(page.selected(), 'progress');
  assert.equal(page.click('activity'), 'activity');
  assert.equal(page.back(), 'progress');
  assert.equal(page.forward(), 'activity');
});

test('tabs: a router navigation without hashchange selects its tab', async () => {
  const page = await mountTabs('');
  assert.equal(page.selected(), 'overview');
  assert.equal(
    page.routerNavigate('activity'),
    'activity',
    '<Link hash="activity">'
  );
  assert.equal(
    page.routerNavigate('track-cms'),
    'progress',
    '<Link hash="track-cms">'
  );
  assert.equal(page.back(), 'activity', 'Back');
  assert.equal(page.back(), 'overview', 'Back to no fragment');
  assert.equal(page.forward(), 'activity', 'Forward');
});

test('tabs: a fragment link to an old section opens its tab and scrolls to it', async () => {
  const page = await mountTabs('');
  assert.equal(page.fragmentLink('updates'), 'activity', '"See all updates"');
  assert.deepEqual(page.scrolled, ['updates']);
  assert.equal(page.fragmentLink('pulse'), 'activity', 'hero "PRs merged"');
  assert.equal(page.back(), 'activity');
  assert.equal(page.back(), 'overview');
});
