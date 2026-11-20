/**
 * Display-text scrubber for the Mastermind fleet snapshot. The publisher and
 * the Web route both run it, so a field never carries a URL, email, path,
 * UUID, token shape or long opaque value even if one side forgets. Matches are
 * removed rather than masked so the phone never shows where a value was.
 */
const PATTERNS: RegExp[] = [
  // PEM blocks and bearer/JWT-looking values.
  /-----BEGIN[\s\S]*?(-----END[^-]*-----|$)/gi,
  /\bbearer\s+\S+/gi,
  /\beyJ[\w-]{6,}\.[\w-]{6,}(\.[\w-]+)?/g,
  // Common credential prefixes.
  /\b(sk|pk|rk|ghp|gho|ghs|ghu|github_pat|xox[abpr]|glpat|AKIA|AIza)[-_A-Za-z0-9]{8,}/g,
  // URLs, emails, IPv4, UUIDs and filesystem paths.
  /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi,
  /[\w.+-]+@[\w-]+(\.[\w-]+)+/g,
  /\b\d{1,3}(\.\d{1,3}){3}\b/g,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  /(~|\.{1,2})?\/[\w.@-]+(\/[\w.@-]+)+\/?/g,
  // key=value secrets and long opaque runs (hex/base64).
  /\b[\w-]*(secret|token|password|passwd|api[_-]?key)[\w-]*\s*[:=]\s*\S+/gi,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b[A-Za-z0-9+/_-]{40,}={0,2}/g,
];

// Bidi overrides, zero-width characters and other invisible controls.
const INVISIBLE = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]',
  'g'
);

export function scrubFleetText(value: string, maxLength: number): string {
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
