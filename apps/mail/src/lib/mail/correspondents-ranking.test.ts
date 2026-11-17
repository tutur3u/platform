import { describe, expect, it } from 'vitest';
import {
  clampCorrespondentLimit,
  correspondentEventWeight,
  rankCorrespondents,
} from './correspondents-ranking';

const now = Date.parse('2026-11-17T00:00:00.000Z');
const daysAgo = (days: number) =>
  new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

describe('correspondentEventWeight', () => {
  it('decays by exp(-age/30) and doubles outbound mail', () => {
    expect(
      correspondentEventWeight({ at: daysAgo(0), direction: 'inbound' }, now)
    ).toBeCloseTo(1);
    expect(
      correspondentEventWeight({ at: daysAgo(30), direction: 'inbound' }, now)
    ).toBeCloseTo(Math.exp(-1));
    expect(
      correspondentEventWeight({ at: daysAgo(30), direction: 'outbound' }, now)
    ).toBeCloseTo(2 * Math.exp(-1));
  });
});

describe('clampCorrespondentLimit', () => {
  it('bounds the limit to 1..20', () => {
    expect(clampCorrespondentLimit('99')).toBe(20);
    expect(clampCorrespondentLimit('0')).toBe(1);
    expect(clampCorrespondentLimit('abc')).toBe(8);
    expect(clampCorrespondentLimit('5')).toBe(5);
  });
});

describe('rankCorrespondents', () => {
  it('aggregates per lowercase address and weights outbound mail', () => {
    const ranked = rankCorrespondents(
      [
        { email: 'A@x.vn', name: null, at: daysAgo(1), direction: 'inbound' },
        { email: 'a@x.vn', name: 'An', at: daysAgo(2), direction: 'inbound' },
        {
          email: 'b@x.vn',
          name: 'Bình',
          at: daysAgo(1),
          direction: 'outbound',
        },
      ],
      { now, limit: 10 }
    );
    expect(ranked.map((row) => row.email)).toEqual(['b@x.vn', 'a@x.vn']);
    expect(ranked[1]).toMatchObject({
      name: 'An',
      direction: 'inbound',
      lastAt: daysAgo(1),
    });
  });

  it('drops mail older than 180 days, excluded addresses and non-matches', () => {
    const ranked = rankCorrespondents(
      [
        {
          email: 'old@x.vn',
          name: null,
          at: daysAgo(181),
          direction: 'outbound',
        },
        { email: 'me@x.vn', name: null, at: daysAgo(1), direction: 'inbound' },
        {
          email: 'phuc@x.vn',
          name: 'Phúc',
          at: daysAgo(3),
          direction: 'inbound',
        },
        {
          email: 'tam@x.vn',
          name: 'Tâm',
          at: daysAgo(1),
          direction: 'inbound',
        },
      ],
      { now, limit: 10, excludedAddresses: ['ME@x.vn'] }
    );
    expect(ranked.map((row) => row.email)).toEqual(['tam@x.vn', 'phuc@x.vn']);
  });

  it('matches names and addresses without diacritics and ranks prefixes first', () => {
    const ranked = rankCorrespondents(
      [
        {
          email: 'zphuc@x.vn',
          name: null,
          at: daysAgo(0),
          direction: 'outbound',
        },
        {
          email: 'tran@x.vn',
          name: 'Trần Phúc',
          at: daysAgo(20),
          direction: 'inbound',
        },
        {
          email: 'tam@x.vn',
          name: 'Tâm',
          at: daysAgo(0),
          direction: 'outbound',
        },
      ],
      { now, limit: 10, query: 'phuc' }
    );
    expect(ranked.map((row) => row.email)).toEqual(['tran@x.vn', 'zphuc@x.vn']);
  });

  it('applies the limit after ranking', () => {
    const events = Array.from({ length: 30 }, (_, index) => ({
      email: `p${index}@x.vn`,
      name: null,
      at: daysAgo(index),
      direction: 'inbound' as const,
    }));
    const ranked = rankCorrespondents(events, { now, limit: 3 });
    expect(ranked.map((row) => row.email)).toEqual([
      'p0@x.vn',
      'p1@x.vn',
      'p2@x.vn',
    ]);
  });
});
