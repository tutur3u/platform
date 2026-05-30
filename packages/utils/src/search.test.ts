import { describe, expect, it } from 'vitest';
import {
  compactIntentText,
  getIntentAcronym,
  normalizeIntentText,
  searchIntent,
} from './search';

type TestItem = {
  aliases?: string[];
  id: string;
  title: string;
};

const items: TestItem[] = [
  { id: 'alpha', title: 'Alpha Workspace' },
  { id: 'acme', title: 'Acme Finance Operations' },
  { id: 'banana', title: 'Banana Lab' },
  { id: 'data', title: 'Data Science Team', aliases: ['DST'] },
  { id: 'viet', title: 'Tiếng Việt Của Tôi' },
  { id: 'qr', title: 'QR Generator', aliases: ['Quick Response'] },
];

describe('intent search', () => {
  it('normalizes accents, punctuation, spacing, and Vietnamese d variants', () => {
    expect(normalizeIntentText('  Tiếng---Việt Đẹp  ')).toBe('tieng viet dep');
    expect(compactIntentText('Alpha_Workspace')).toBe('alphaworkspace');
  });

  it('builds acronyms from normalized words', () => {
    expect(getIntentAcronym('Acme Finance Operations')).toBe('afo');
  });

  it('matches close workspace names with bounded typos', () => {
    const [result] = searchIntent(items, 'alhpa workspace');

    expect(result?.item.id).toBe('alpha');
    expect(result?.reason).toBe('typo');
  });

  it('matches punctuation and spacing insensitive queries', () => {
    const [result] = searchIntent(items, 'alpha-work space');

    expect(result?.item.id).toBe('alpha');
    expect(result?.reason).toBe('compact');
  });

  it('matches acronyms and aliases', () => {
    expect(searchIntent(items, 'afo')[0]?.item.id).toBe('acme');
    expect(searchIntent(items, 'dst')[0]?.item.id).toBe('data');
  });

  it('matches words in query order independent of target word order', () => {
    const [result] = searchIntent(items, 'team data');

    expect(result?.item.id).toBe('data');
    expect(result?.reason).toBe('word-order');
  });

  it('matches Vietnamese accents with unaccented input', () => {
    const [result] = searchIntent(items, 'tieng viet');

    expect(result?.item.id).toBe('viet');
  });

  it('limits short-query noise to strong matches', () => {
    const results = searchIntent(items, 'ba');

    expect(results.map((result) => result.item.id)).toEqual(['banana']);
  });

  it('keeps result ordering stable for equal scores', () => {
    const stableItems = [
      { id: 'one', title: 'Alpha Team' },
      { id: 'two', title: 'Alpha Squad' },
    ];

    expect(
      searchIntent(stableItems, 'alpha').map((result) => result.item.id)
    ).toEqual(['one', 'two']);
  });

  it('uses ordered fuzzy matching for intentional abbreviations', () => {
    const [result] = searchIntent(items, 'qgn');

    expect(result?.item.id).toBe('qr');
    expect(result?.reason).toBe('fuzzy');
  });
});
