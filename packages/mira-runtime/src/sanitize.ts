const MASS_MENTION = /@(everyone|here)\b/gi;
const DISCORD_ROLE_OR_USER = /<@[!&]?\d+>/g;
// Any HTML tag, so <img>, <picture>, <source> and similar cannot render.
const HTML_TAG = /<\/?[a-z][^>]*>/gi;
const REFERENCE_IMAGE = /!\[([^\]\n]*)\]\[[^\]\n]*\]/g;
// Link reference definitions, also inside blockquotes or with the URL on the
// following line.
const REFERENCE_DEFINITION =
  /^[ \t>]*\[[^\]\n]+\]:[ \t]*(?:\S.*|\n[ \t>]*\S.*)?$/gm;
// Whatever image syntax survives is broken so it cannot form an image.
const IMAGE_OPENER = /!\[/g;
const ZERO_WIDTH_SPACE = '\u200b';

/** Index just past the `)` closing the destination that opens at `start`. */
function closingParen(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === '\n') return -1;
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === '(') depth++;
    if (char === ')' && --depth === 0) return i + 1;
  }
  return -1;
}

/** Index of the `]` closing the alt text that opens at `start`. */
function closingBracket(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === '\n') return -1;
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === '[') depth++;
    if (char === ']' && --depth === 0) return i;
  }
  return -1;
}

/** Replaces inline images, including nested parentheses, with their alt. */
function stripInlineImages(text: string): string {
  let out = '';
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf('![', cursor);
    if (open === -1) break;
    const altEnd = closingBracket(text, open + 1);
    if (altEnd === -1 || text[altEnd + 1] !== '(') {
      out += text.slice(cursor, open + 2);
      cursor = open + 2;
      continue;
    }
    const end = closingParen(text, altEnd + 1);
    if (end === -1) {
      // Unterminated destination: drop it to the end of the line.
      const lineEnd = text.indexOf('\n', altEnd);
      out += text.slice(cursor, open) + text.slice(open + 2, altEnd).trim();
      cursor = lineEnd === -1 ? text.length : lineEnd;
      continue;
    }
    out += text.slice(cursor, open) + text.slice(open + 2, altEnd).trim();
    cursor = end;
  }
  return out + text.slice(cursor);
}

/**
 * Neutralizes model output before delivery. Images (inline, reference-style
 * and HTML) are reduced to their alt text and reference definitions removed,
 * so crafted image URLs cannot leak context through previews or renderers;
 * mass and explicit mentions are broken so output cannot ping people.
 * Discord sends also carry allowed_mentions with nothing parsed.
 */
export function sanitizeOutboundText(text: string): string {
  return stripInlineImages(text)
    .replace(REFERENCE_IMAGE, (_match, alt: string) => alt.trim())
    .replace(REFERENCE_DEFINITION, '')
    .replace(HTML_TAG, '')
    .replace(IMAGE_OPENER, `!${ZERO_WIDTH_SPACE}[`)
    .replace(
      MASS_MENTION,
      (_match, word: string) => `@${ZERO_WIDTH_SPACE}${word}`
    )
    .replace(DISCORD_ROLE_OR_USER, (match) =>
      match.replace('<@', `<@${ZERO_WIDTH_SPACE}`)
    );
}

/** Discord payload fields that disable mention parsing and link embeds. */
export const DISCORD_SAFE_MESSAGE_FIELDS = {
  allowed_mentions: { parse: [] as string[], replied_user: true },
  // SUPPRESS_EMBEDS
  flags: 1 << 2,
} as const;
