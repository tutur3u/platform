// Publisher copy of the Web fleet scrubber
// (apps/web/src/lib/mastermind/fleet/scrub.ts; `scrub.test.mjs` keeps the two
// identical), plus the Web edge guard's per-field limits
// (packages/utils/src/request-emoji-limit.ts). Running both before sending
// means a field the server would empty, or the edge would refuse, never
// reaches it: either outcome rejects the whole snapshot.

const PATTERNS = [
  /-----BEGIN[\s\S]*?(-----END[^-]*-----|$)/gi,
  /\bbearer\s+\S+/gi,
  /\beyJ[\w-]{6,}\.[\w-]{6,}(\.[\w-]+)?/g,
  /\b(sk|pk|rk|ghp|gho|ghs|ghu|github_pat|xox[abpr]|glpat|AKIA|AIza)[-_A-Za-z0-9]{8,}/g,
  /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi,
  /[\w.+-]+@[\w-]+(\.[\w-]+)+/g,
  /\b\d{1,3}(\.\d{1,3}){3}\b/g,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  /(~|\.{1,2})?\/[\w.@-]+(\/[\w.@-]+)+\/?/g,
  /\b[\w-]*(secret|token|password|passwd|api[_-]?key)[\w-]*\s*[:=]\s*\S+/gi,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b[A-Za-z0-9+/_-]{40,}={0,2}/g,
];

const INVISIBLE = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]',
  'g'
);

export function scrubFleetText(value, maxLength) {
  let text = value.normalize('NFKC').replace(INVISIBLE, '');
  for (const pattern of PATTERNS) text = text.replace(pattern, ' ');
  text = text
    .replace(/[`*_#>|[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > maxLength * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The edge guard refuses a string field with more than ten emoji. */
export const MAX_EMOJIS_PER_FIELD = 10;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const FLAG = /^(?:\p{Regional_Indicator}{2})$/u;
const KEYCAP = /^(?:[#*0-9]️?⃣)$/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function isEmoji(segment) {
  return (
    PICTOGRAPHIC.test(segment) || FLAG.test(segment) || KEYCAP.test(segment)
  );
}

/** Emoji graphemes in `text`, counted the way the edge guard counts them. */
export function countEmoji(text) {
  let count = 0;
  for (const { segment } of segmenter.segment(text))
    if (isEmoji(segment)) count++;
  return count;
}

/**
 * Drops emoji graphemes past the edge guard's per-field limit. Removing one
 * can join its neighbours into a new grapheme (two regional indicators make
 * a flag), so it re-segments until the result itself is within the limit.
 */
export function limitEmoji(text) {
  let current = text;
  for (let pass = 0; pass < 8; pass++) {
    let seen = 0;
    let out = '';
    for (const { segment } of segmenter.segment(current)) {
      if (isEmoji(segment) && ++seen > MAX_EMOJIS_PER_FIELD) continue;
      out += segment;
    }
    current = out.replace(/\s+/g, ' ').trim();
    if (countEmoji(current) <= MAX_EMOJIS_PER_FIELD) return current;
  }
  // Pathological input: keep no emoji at all.
  return [...segmenter.segment(current)]
    .map(({ segment }) => segment)
    .filter(
      (segment) => !isEmoji(segment) && !/\p{Regional_Indicator}/u.test(segment)
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Text exactly as the server will store it, already within the edge limits:
 * scrubbed to a fixed point, so the server's own pass changes nothing. An
 * empty result means the server would empty the field too, or the text never
 * settled.
 */
export function fleetText(value, max) {
  if (typeof value !== 'string') return '';
  // The scrub's "…" becomes "..." under NFKC on the server's pass; leaving
  // room for those two characters keeps that pass from cutting again.
  const cap = Math.max(1, max - 2);
  let text = value;
  for (let pass = 0; pass < 6; pass++) {
    const next = limitEmoji(scrubFleetText(text, cap)).normalize('NFKC');
    if (next === text) break;
    text = next;
  }
  return scrubFleetText(text, max) === text &&
    countEmoji(text) <= MAX_EMOJIS_PER_FIELD
    ? text
    : '';
}
