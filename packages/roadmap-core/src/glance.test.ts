/** D79: the glance grid and the headline deltas read the way they should. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { glanceBand, glanceOrder } from './components/glance-model.ts';
import {
  deltaAsPercent,
  deltaText,
  PCT_MAX_RATIO,
  PCT_MIN_BASE,
} from './components/insights/format.ts';
import { change } from './insights/series.ts';

describe('glance grid', () => {
  it('colours a ring by how much of the track shipped', () => {
    assert.equal(glanceBand(1), 'done');
    assert.equal(glanceBand(0.95), 'good');
    assert.equal(glanceBand(0.8), 'good');
    assert.equal(glanceBand(0.79), 'attention');
    assert.equal(glanceBand(0), 'attention');
  });
  it('puts the tracks with the most left first, keeping ties in order', () => {
    const items = [
      { id: 'a', share: 1 },
      { id: 'b', share: 0.65 },
      { id: 'c', share: 0.9 },
      { id: 'd', share: 0.65 },
      { id: 'e', share: 1 },
    ];
    assert.deepEqual(
      glanceOrder(items).map((item) => item.id),
      ['b', 'd', 'c', 'a', 'e']
    );
    // The input keeps the curated order.
    assert.deepEqual(
      items.map((item) => item.id),
      ['a', 'b', 'c', 'd', 'e']
    );
  });
});

describe('headline deltas', () => {
  it('shows a percentage only on a real base and a sane ratio', () => {
    // 385 vs 294: a percentage.
    assert.equal(deltaText(change(385, 294), 'en'), '+31%');
    assert.ok(deltaAsPercent(change(385, 294)));
    // 12 vs 1 (the "+1,100%" case): a count.
    assert.equal(deltaText(change(12, 1), 'en'), '+11');
    // A base under PCT_MIN_BASE: a count.
    assert.equal(deltaText(change(4, PCT_MIN_BASE - 1), 'en'), '−5');
    // On a real base but past PCT_MAX_RATIO: a count.
    const outsized = change(PCT_MIN_BASE * (PCT_MAX_RATIO + 2), PCT_MIN_BASE);
    assert.ok(!deltaAsPercent(outsized));
    assert.equal(
      deltaText(outsized, 'en'),
      `+${PCT_MIN_BASE * (PCT_MAX_RATIO + 1)}`
    );
    // No base at all, and no change.
    assert.equal(deltaText(change(5, 0), 'en'), '+5');
    assert.equal(deltaText(change(7, 7), 'en'), '0');
  });
});
