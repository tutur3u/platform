import { describe, expect, it } from 'vitest';
import {
  findFoldedMatch,
  foldedMatchQuality,
  foldSearchText,
} from './search-fold';

describe('foldSearchText', () => {
  it('folds Vietnamese diacritics and đ', () => {
    expect(foldSearchText('Phúc Võ')).toBe('phuc vo');
    expect(foldSearchText('Đặng Tâm')).toBe('dang tam');
  });

  it('keeps one character per input character, including decomposed input', () => {
    const decomposed = 'Phúc';
    expect(foldSearchText(decomposed)).toBe('phuc');
    expect(foldSearchText('Nguyễn').length).toBe('Nguyễn'.length);
  });
});

describe('findFoldedMatch', () => {
  it('maps an accent-insensitive match back to the original text', () => {
    const match = findFoldedMatch('Hoàng Phúc', 'phuc');
    expect(match).not.toBeNull();
    expect(match!.text.slice(match!.start, match!.end)).toBe('Phúc');
  });

  it('returns null for blank or missing queries', () => {
    expect(findFoldedMatch('Tâm', ' ')).toBeNull();
    expect(findFoldedMatch('Tâm', 'xyz')).toBeNull();
  });
});

describe('foldedMatchQuality', () => {
  it('prefers prefixes and word starts over inner substrings', () => {
    expect(foldedMatchQuality('phuc.tran@sepay.vn', 'phuc')).toBe(2);
    expect(foldedMatchQuality('Nguyễn Phúc An', 'phuc')).toBe(2);
    expect(foldedMatchQuality('aphuc@x.vn', 'phuc')).toBe(1);
    expect(foldedMatchQuality('Tâm', 'phuc')).toBe(0);
    expect(foldedMatchQuality(null, 'phuc')).toBe(0);
  });
});
