const COMBINING_MARKS = /[̀-ͯ]/gu;

function foldCharacter(character: string) {
  const folded = character
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase();
  return folded === 'đ' ? 'd' : folded;
}

/**
 * Folds text for accent-insensitive matching: "Phúc" and "phuc" fold to the
 * same value, and "Đ" folds to "d". Each character of the NFC input folds to
 * exactly one character, so offsets in the folded text map back to the input.
 */
export function foldSearchText(value: string) {
  return Array.from(value.normalize('NFC'), (character) => {
    const folded = foldCharacter(character);
    return folded.length === 1 ? folded : character.toLowerCase();
  }).join('');
}

/**
 * Finds the first accent-insensitive occurrence of `query` in `text` and
 * returns its range in the NFC form of `text`, or null.
 */
export function findFoldedMatch(text: string, query: string) {
  const needle = foldSearchText(query.trim());
  if (!needle) return null;
  const source = text.normalize('NFC');
  const characters = Array.from(source);
  const folded = Array.from(foldSearchText(source));
  const index = folded.join('').indexOf(needle);
  if (index < 0) return null;
  // Convert code-unit offsets of the folded string to code-point offsets.
  let units = 0;
  let startPoint = 0;
  while (units < index) units += folded[startPoint++]!.length;
  let endPoint = startPoint;
  let matched = 0;
  while (matched < needle.length) matched += folded[endPoint++]!.length;
  const start = characters.slice(0, startPoint).join('').length;
  const end = start + characters.slice(startPoint, endPoint).join('').length;
  return { text: source, start, end };
}

/**
 * Scores how well `query` matches: 2 for a prefix of the value or of one of
 * its words, 1 for any other substring, 0 for no match.
 */
export function foldedMatchQuality(value: string | null, query: string) {
  if (!value) return 0;
  const needle = foldSearchText(query.trim());
  if (!needle) return 0;
  const haystack = foldSearchText(value);
  const index = haystack.indexOf(needle);
  if (index < 0) return 0;
  if (index === 0) return 2;
  return /[\s._+@-]/u.test(haystack[index - 1] ?? '') ||
    haystack.split(/[\s._+@-]+/u).some((word) => word.startsWith(needle))
    ? 2
    : 1;
}
