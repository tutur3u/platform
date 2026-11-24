/**
 * Characters that are shown as nothing but would pass a length check: they are
 * dropped outright so they neither split a word nor fill a name on their own.
 */
const DROPPED = new Set([
  0x00ad, // soft hyphen
  0x034f, // combining grapheme joiner
  0x115f, // Hangul choseong filler
  0x1160, // Hangul jungseong filler
  0x17b4,
  0x17b5,
  0x180e, // Mongolian vowel separator
  0x2800, // braille blank
  0x3164, // Hangul filler
  0xffa0, // halfwidth Hangul filler
]);
const ZWNJ = 0x200c;
const ZWJ = 0x200d;
const BLACK_FLAG = 0x1f3f4;
/** Control, format and separator characters stand for a break between words. */
const BREAK = /[\p{Cc}\p{Cf}\p{Z}]/u;

const isJoiner = (codePoint: number) => codePoint === ZWJ || codePoint === ZWNJ;
const isTag = (codePoint: number) =>
  codePoint >= 0xe0000 && codePoint <= 0xe007f;

/**
 * Normalizes a meeting name in one linear pass: composed form, hidden
 * characters turned into single spaces, invisible fillers and soft hyphens
 * dropped, whitespace collapsed and trimmed.
 *
 * Zero-width joiners and non-joiners stay between visible characters, because
 * emoji sequences and Persian need them, and a run of them collapses to one.
 * Tag characters stay only after a black flag, where they spell a subdivision
 * flag. Never use a backtracking pattern here: callers pass untrusted text.
 */
export function sanitizeMeetingName(value: string) {
  const out: string[] = [];
  let flag = false;
  const lastCodePoint = () => out[out.length - 1]?.codePointAt(0);
  for (const character of value.normalize('NFC')) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isJoiner(codePoint)) {
      const last = lastCodePoint();
      if (last !== undefined && last !== 0x20 && !isJoiner(last))
        out.push(character);
      continue;
    }
    if (codePoint === BLACK_FLAG) {
      flag = true;
      out.push(character);
      continue;
    }
    if (isTag(codePoint)) {
      if (flag) out.push(character);
      continue;
    }
    flag = false;
    if (DROPPED.has(codePoint)) continue;
    if (BREAK.test(character)) {
      let last = lastCodePoint();
      while (last !== undefined && isJoiner(last)) {
        out.pop();
        last = lastCodePoint();
      }
      if (last !== undefined && last !== 0x20) out.push(' ');
      continue;
    }
    out.push(character);
  }
  let last = lastCodePoint();
  while (last !== undefined && (last === 0x20 || isJoiner(last))) {
    out.pop();
    last = lastCodePoint();
  }
  return out.join('');
}

/**
 * Cuts to at most `max` user-perceived characters and, when `maxUnits` is
 * given, at most that many UTF-16 code units, never inside a grapheme.
 */
export function truncateGraphemes(
  value: string,
  max: number,
  maxUnits = Number.POSITIVE_INFINITY
) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const parts: string[] = [];
  let units = 0;
  for (const { segment } of segmenter.segment(value)) {
    if (parts.length === max || units + segment.length > maxUnits) break;
    parts.push(segment);
    units += segment.length;
  }
  return parts.join('');
}
