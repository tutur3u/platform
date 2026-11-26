import { splitGraphemes } from '@tuturuuu/utils/name-helper';

const visible = (grapheme: string) => /^[\p{L}\p{N}]/u.test(grapheme);

/**
 * Up to two initials for a person's avatar: the first letters of their first
 * and last words, or the first two of a single word. Words without a letter
 * or digit, such as an emoji, are skipped, and an emoji, a combining mark or
 * a Vietnamese tone mark is never split. Uppercasing ignores the runtime
 * locale, so the server render and the browser agree.
 */
export function personInitials(name: string, fallback = '?') {
  const words = name
    .trim()
    .split(/\s+/u)
    .map((word) => splitGraphemes(word).filter(visible))
    .filter((letters) => letters.length > 0);
  const [first] = words;
  const last = words.at(-1);
  const letters =
    words.length > 1 && first && last
      ? `${first[0]}${last[0]}`
      : (first?.slice(0, 2).join('') ?? '');
  return letters.toUpperCase() || fallback;
}

/** The first character of a name, uppercased, whole even for an emoji. */
export function personInitial(name: string, fallback = '?') {
  return splitGraphemes(name.trim())[0]?.toUpperCase() || fallback;
}
