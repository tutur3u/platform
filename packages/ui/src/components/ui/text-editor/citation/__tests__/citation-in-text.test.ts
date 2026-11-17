import { describe, expect, it } from 'vitest';
import { citationInText } from '../in-text';

describe('citationInText', () => {
  const inText = { first: '(Vale, 2024)' };

  it('returns the formatted text for an own citation id', () => {
    expect(citationInText(inText, 'first')).toBe('(Vale, 2024)');
  });

  it.each([
    'toString',
    'constructor',
    'valueOf',
    '__proto__',
    'hasOwnProperty',
  ])('never resolves the inherited member %s', (id) => {
    expect(citationInText(inText, id)).toBeUndefined();
  });

  it('returns undefined without a result or an id', () => {
    expect(citationInText(undefined, 'first')).toBeUndefined();
    expect(citationInText(inText, null)).toBeUndefined();
    expect(citationInText(inText, '')).toBeUndefined();
  });
});
