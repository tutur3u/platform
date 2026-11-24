/**
 * Control, format and line-separator characters (zero-width joiners, bidi
 * overrides, newlines) that must never reach a stored meeting name.
 */
const HIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;
const JOINER = '\u200D';

/**
 * Normalizes a meeting name: composed form, hidden characters turned into
 * spaces, whitespace collapsed and trimmed. A zero-width joiner stays between
 * visible characters because emoji sequences need it, and goes when it is
 * alone at an edge of a word.
 */
export function sanitizeMeetingName(value: string) {
  return value
    .normalize('NFC')
    .replace(HIDDEN_CHARACTERS, (character) =>
      character === JOINER ? character : ' '
    )
    .replace(/\s+/gu, ' ')
    .replace(/(^|\s)\u200D+|\u200D+(?=\s|$)/gu, '$1')
    .trim();
}

/** Cuts to at most `max` user-perceived characters, never inside a grapheme. */
export function truncateGraphemes(value: string, max: number) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const parts: string[] = [];
  for (const { segment } of segmenter.segment(value)) {
    if (parts.length === max) break;
    parts.push(segment);
  }
  return parts.join('');
}
