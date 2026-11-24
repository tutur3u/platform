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

  it('runs in linear time on a long run of joiners', () => {
    const run = `a${hidden(0x200d).repeat(100_000)}b`;
    const started = performance.now();
    expect(sanitizeMeetingName(run)).toBe(`a${hidden(0x200d)}b`);
    expect(performance.now() - started).toBeLessThan(50);
    const edges = `${hidden(0x200d).repeat(100_000)} a ${hidden(0x200c).repeat(100_000)}`;
    expect(sanitizeMeetingName(edges)).toBe('a');
  });

  it('drops soft hyphens and invisible fillers instead of spacing them', () => {
    expect(sanitizeMeetingName(`co${hidden(0xad)}op`)).toBe('coop');
    expect(
      sanitizeMeetingName(hidden(0x3164, 0x2800, 0x34f, 0x115f, 0x1160, 0xffa0))
    ).toBe('');
  });

  it('keeps a non-joiner inside Persian words', () => {
    const persian = `می${hidden(0x200c)}خواهم`;
    expect(sanitizeMeetingName(persian)).toBe(persian);
  });

  it('strips tag characters except in a subdivision flag', () => {
    const scotland = hidden(
      0x1f3f4,
      0xe0067,
      0xe0062,
      0xe0073,
      0xe0063,
      0xe0074,
      0xe007f
    );
    expect(sanitizeMeetingName(scotland)).toBe(scotland);
    expect(sanitizeMeetingName(`a${hidden(0xe0041)}b`)).toBe('ab');
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
