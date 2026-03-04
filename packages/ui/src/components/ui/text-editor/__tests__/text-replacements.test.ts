import { describe, expect, it } from 'vitest';
import {
  getNormalizedCursorPosition,
  normalizeLiveTextReplacements,
  normalizeTextReplacements,
} from '../text-replacements';

describe('text replacements', () => {
  it('normalizes common ASCII shortcuts', () => {
    expect(
      normalizeTextReplacements(
        'a -> b <- c <-> d --> e ---> f <-- g <--- h <--> i <---> j >= k <= l != m +- n ... (tm) (c) (r) --'
      )
    ).toBe('a → b ← c ↔ d ⟶ e ⟶ f ⟵ g ⟵ h ⟷ i ⟷ j ≥ k ≤ l ≠ m ± n … ™ © ® –');
  });

  it('keeps ambiguous trailing prefixes raw while typing', () => {
    expect(normalizeLiveTextReplacements('<-')).toBe('<-');
    expect(normalizeLiveTextReplacements('<--')).toBe('<--');
    expect(normalizeLiveTextReplacements('--')).toBe('--');
  });

  it('converts longer arrow forms once they become unambiguous', () => {
    expect(normalizeLiveTextReplacements('<->')).toBe('↔');
    expect(normalizeLiveTextReplacements('-->')).toBe('⟶');
    expect(normalizeLiveTextReplacements('--->')).toBe('⟶');
    expect(normalizeLiveTextReplacements('<-->')).toBe('⟷');
    expect(normalizeLiveTextReplacements('<--->')).toBe('⟷');
  });

  it('calculates cursor position after normalization', () => {
    expect(getNormalizedCursorPosition('abc -> def', 6)).toBe(5);
    expect(getNormalizedCursorPosition('hello...', 8)).toBe(6);
    expect(getNormalizedCursorPosition('foo (tm)', 8)).toBe(5);
    expect(
      getNormalizedCursorPosition('<-> hello', 3, normalizeLiveTextReplacements)
    ).toBe(1);
  });
});
