import { describe, expect, it } from 'vitest';
import { sanitizeMeetingName, truncateGraphemes } from './meeting-name';

/** Invisible characters by code point, so the source stays readable. */
const hidden = (...codes: number[]) => String.fromCodePoint(...codes);

describe('sanitizeMeetingName', () => {
  it('turns control and format characters into single spaces', () => {
    expect(
      sanitizeMeetingName(
        `Weekly${hidden(0x0, 0x200b)}sync\n${hidden(0x202e)}room${hidden(0x2028)}x`
      )
    ).toBe('Weekly sync room x');
  });

  it('composes decomposed Vietnamese text and trims', () => {
    const decomposed = 'Cuộc họp của Trần'.normalize('NFD');
    expect(sanitizeMeetingName(`  ${decomposed}  `)).toBe(
      'Cuộc họp của Trần'.normalize('NFC')
    );
  });

  it('keeps emoji joiners but drops a stray one at a word edge', () => {
    const family = '👩\u200D👩\u200D👧\u200D👦';
    expect(sanitizeMeetingName(`${family} room`)).toBe(`${family} room`);
    expect(sanitizeMeetingName(`${hidden(0x200d)}room ${hidden(0x200d)}`)).toBe(
      'room'
    );
  });

  it('is empty when nothing visible remains', () => {
    expect(
      sanitizeMeetingName(`${hidden(0x200b, 0x200d)} 
`)
    ).toBe('');
  });
});

describe('truncateGraphemes', () => {
  it('keeps an emoji at the cut whole or drops it, never half', () => {
    const name = `${'a'.repeat(79)}👩‍👩‍👧‍👦tail`;
    expect(truncateGraphemes(name, 80)).toBe(`${'a'.repeat(79)}👩‍👩‍👧‍👦`);
    expect(truncateGraphemes(`${'a'.repeat(80)}👩‍👩‍👧‍👦`, 80)).toBe('a'.repeat(80));
  });

  it('does not split a base letter from its combining accent', () => {
    const name = `${'b'.repeat(79)}éx`;
    expect(truncateGraphemes(name, 80)).toBe(`${'b'.repeat(79)}é`);
  });
});
