import { describe, expect, it } from 'vitest';
import { MIND_HORIZONS } from '../components/mind/model';

describe('Mind app constants', () => {
  it('keeps long-range horizons available for planning filters', () => {
    expect(MIND_HORIZONS).toContain('day');
    expect(MIND_HORIZONS).toContain('five_year');
    expect(MIND_HORIZONS).toContain('fifty_year');
    expect(MIND_HORIZONS).toContain('long_arc');
  });
});
