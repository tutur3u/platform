const MASS_MENTION = /@(everyone|here)\b/gi;
const DISCORD_ROLE_OR_USER = /<@[!&]?\d+>/g;
// Bounded quantifiers keep the match linear on long unclosed `![` runs.
const REFERENCE_IMAGE = /!\[([^\]\n]{0,1000})\]\[[^\]\n]{0,1000}\]/g;
// A `<` that could still open a tag, comment or declaration after stripping.
const TAG_OPENER = /<(?=[a-z/!?])/gi;
// Whatever image syntax survives is broken so it cannot form an image.
const IMAGE_OPENER = /!\[/g;
const ZERO_WIDTH_SPACE = '\u200b';
// Scan bounds keep image stripping linear: each `![` reads at most this many
// characters. An alt text that does not close in time is not treated as an
// image (its `![` is broken below); a destination that does not close in time
// is dropped to the end of the line.
const MAX_ALT_SCAN = 1_000;
const MAX_DESTINATION_SCAN = 4_096;
const MAX_TAG_PASSES = 4;

/** Index just past the `)` closing the destination that opens at `start`. */
function closingParen(text: string, start: number): number {
  let depth = 0;
  const end = Math.min(text.length, start + MAX_DESTINATION_SCAN);
  for (let i = start; i < end; i++) {
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
  const end = Math.min(text.length, start + MAX_ALT_SCAN);
  for (let i = start; i < end; i++) {
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

function isAsciiLetter(char: string | undefined): boolean {
  return (
    char !== undefined &&
    ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z'))
  );
}

/**
 * Removes HTML tags (`<name ...>` and `</name ...>`) in one linear scan, so
 * <img>, <picture>, <source> and similar cannot render. A tag runs to the
 * next `>`; once no `>` remains, no later tag can close either.
 */
function stripHtmlTags(text: string): string {
  let out = '';
  let cursor = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '<') continue;
    const nameStart = text[i + 1] === '/' ? i + 2 : i + 1;
    if (!isAsciiLetter(text[nameStart])) continue;
    const close = text.indexOf('>', nameStart);
    if (close === -1) break;
    out += text.slice(cursor, i);
    cursor = close + 1;
    i = close;
  }
  return out + text.slice(cursor);
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/**
 * When [line] is a link reference definition (`[label]: destination`, also
 * inside blockquotes), returns whether its destination is on the next line.
 * Returns null for any other line. Linear in the line length.
 */
function referenceDefinition(line: string): { continues: boolean } | null {
  let i = 0;
  while (
    i < line.length &&
    (line[i] === ' ' || line[i] === '\t' || line[i] === '>')
  ) {
    i++;
  }
  if (line[i] !== '[') return null;
  const labelEnd = line.indexOf(']', i + 1);
  if (labelEnd <= i + 1 || line[labelEnd + 1] !== ':') return null;
  return { continues: isBlank(line.slice(labelEnd + 2)) };
}

/**
 * Strips tags that an earlier strip rebuilt from overlapping input, up to a
 * fixed number of linear passes; the caller then breaks any opener left.
 */
function stripHtmlTagsUntilStable(text: string): string {
  let current = text;
  for (let pass = 0; pass < MAX_TAG_PASSES; pass++) {
    const next = stripHtmlTags(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

/** Drops link reference definitions, including a destination on the next line. */
function stripReferenceDefinitions(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const definition = referenceDefinition(line);
    if (!definition) {
      kept.push(line);
      continue;
    }
    // The blanked line keeps the line count; a destination on the following
    // line is dropped with it.
    kept.push('');
    const next = lines[index + 1];
    if (definition.continues && next !== undefined && !isBlank(next)) {
      index++;
    }
  }
  return kept.join('\n');
}

/**
 * Neutralizes model output before delivery. Images (inline, reference-style
 * and HTML) are reduced to their alt text and reference definitions removed,
 * so crafted image URLs cannot leak context through previews or renderers;
 * mass and explicit mentions are broken so output cannot ping people.
 * Discord sends also carry allowed_mentions with nothing parsed.
 */
export function sanitizeOutboundText(text: string): string {
  const withoutImages = stripInlineImages(text).replace(
    REFERENCE_IMAGE,
    (_match, alt: string) => alt.trim()
  );
  return (
    stripHtmlTagsUntilStable(stripReferenceDefinitions(withoutImages))
      // Whatever could still open a tag after the bounded passes is broken, so
      // the output never contains a tag and sanitizing it again is a no-op.
      .replace(TAG_OPENER, `<${ZERO_WIDTH_SPACE}`)
      .replace(IMAGE_OPENER, `!${ZERO_WIDTH_SPACE}[`)
      .replace(
        MASS_MENTION,
        (_match, word: string) => `@${ZERO_WIDTH_SPACE}${word}`
      )
      .replace(DISCORD_ROLE_OR_USER, (match) =>
        match.replace('<@', `<@${ZERO_WIDTH_SPACE}`)
      )
  );
}

/** Discord payload fields that disable mention parsing and link embeds. */
export const DISCORD_SAFE_MESSAGE_FIELDS = {
  allowed_mentions: { parse: [] as string[], replied_user: true },
  // SUPPRESS_EMBEDS
  flags: 1 << 2,
} as const;
