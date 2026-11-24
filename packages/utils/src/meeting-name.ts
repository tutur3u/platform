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
const isSurrogate = (codePoint: number) =>
  codePoint >= 0xd800 && codePoint <= 0xdfff;
/** Tag digits and lowercase letters, the only ones a subdivision flag uses. */
const isFlagTag = (codePoint: number) =>
  (codePoint >= 0xe0030 && codePoint <= 0xe0039) ||
  (codePoint >= 0xe0061 && codePoint <= 0xe007a);
const CANCEL_TAG = 0xe007f;
const MAX_FLAG_TAGS = 6;
/** Something a reader can see: not a mark, a variation selector or a joiner. */
const VISIBLE = /[^\p{M}\p{Variation_Selector}\p{Cf}\s]/u;

/**
 * Tag characters spell a subdivision flag only as 1 to 6 tag letters or digits
 * straight after the black flag, closed by the cancel tag. Any other run, such
 * as tag-encoded text, is hidden data and is dropped.
 */
function flagTagEnd(codePoints: readonly number[], start: number) {
  let end = start;
  while (end < codePoints.length && isTag(codePoints[end] ?? 0)) end++;
  const length = end - start;
  const valid =
    length >= 2 &&
    length - 1 <= MAX_FLAG_TAGS &&
    codePoints[end - 1] === CANCEL_TAG &&
    codePoints.slice(start, end - 1).every(isFlagTag);
  return { end, valid };
}

/**
 * Normalizes a meeting name in one linear pass: composed form, hidden
 * characters turned into single spaces, invisible fillers, soft hyphens and
 * lone surrogates dropped, whitespace collapsed and trimmed. A name with
 * nothing but marks or variation selectors left is empty.
 *
 * Zero-width joiners and non-joiners stay between visible characters, because
 * emoji sequences and Persian need them, and a run of them collapses to one.
 * Tag characters stay only as a real subdivision flag after a black flag.
 *
 * Callers must cap the input first (about 2048 characters): String.normalize
 * is super-linear on very long runs of combining marks. Never use a
 * backtracking pattern here: callers pass untrusted text.
 */
export function sanitizeMeetingName(value: string) {
  const out: string[] = [];
  const characters = Array.from(value.normalize('NFC'));
  const codePoints = characters.map(
    (character) => character.codePointAt(0) ?? 0
  );
  const lastCodePoint = () => out[out.length - 1]?.codePointAt(0);
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index] as string;
    const codePoint = codePoints[index] as number;
    if (isSurrogate(codePoint)) continue;
    if (isJoiner(codePoint)) {
      const last = lastCodePoint();
      if (last !== undefined && last !== 0x20 && !isJoiner(last))
        out.push(character);
      continue;
    }
    if (codePoint === BLACK_FLAG) {
      out.push(character);
      const { end, valid } = flagTagEnd(codePoints, index + 1);
      if (valid)
        for (let tag = index + 1; tag < end; tag++)
          out.push(characters[tag] as string);
      index = end - 1;
      continue;
    }
    if (isTag(codePoint) || DROPPED.has(codePoint)) continue;
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
  const name = out.join('');
  return VISIBLE.test(name) ? name : '';
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
