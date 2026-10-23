/**
 * Markdown link and image syntax used by the rich-text codec.
 *
 * The patterns must run in linear time on user-authored markdown. The earlier
 * forms used ambiguous alternations such as `(?:\\[()]|[^)\s])+` and
 * `(?:\\.|[^"])*`, where a backslash can be matched either as the start of an
 * escape or as an ordinary character. A long run of `\(`, `\\` or `\!` then
 * forced exponential backtracking before the match failed.
 *
 * The rewritten groups tokenize every input in one way and keep only the
 * choices that changed the old result, explored in the same order:
 *
 * - Destination: `\(` is an ordinary pair, so only `\)` is a choice. The old
 *   pattern preferred consuming `\)` as an escape and otherwise ended the
 *   destination at the backslash, so `(?:\\\)|[^)\s])+` keeps that order.
 * - Quoted title (closed by `"`) and image alt text (closed by `]`): whole
 *   backslash runs are consumed at once. Before a closing character, an odd run
 *   first tries to escape it and an even run first tries to end there, with the
 *   other choice as the fallback, exactly as the old pattern backtracked.
 *
 * `markdown-link-syntax.test.ts` checks match parity against the old patterns.
 */
const DESTINATION = String.raw`((?:\\\)|[^)\s])+)`;
const TITLE = String.raw`(?:\s+"((?:[^"\\]|\\+(?!["\\])|(?:\\\\)*\\"|\\+(?=")|(?:\\\\)+")*)")?`;
const ESCAPABLE_ALT = String.raw`((?:[^\]\\]|\\+(?![\]\\])|(?:\\\\)*\\\]|\\+(?=\])|(?:\\\\)+\])*)`;

/** Inline image: alt (1), destination (2) and optional title (3). */
export const INLINE_IMAGE_PATTERN = new RegExp(
  String.raw`!\[([^\]]*)\]\(${DESTINATION}${TITLE}\)`,
  'u'
);

/** Inline link: label (1), destination (2) and optional title (3). */
export const INLINE_LINK_PATTERN = new RegExp(
  String.raw`\[([^\]]+)\]\(${DESTINATION}${TITLE}\)`,
  'u'
);

/** Standalone image line: escaped alt (1), destination (2), title (3). */
export const BLOCK_IMAGE_PATTERN = new RegExp(
  String.raw`^!\[${ESCAPABLE_ALT}\]\(${DESTINATION}${TITLE}\)$`,
  'u'
);

/**
 * Escape a link or image destination. Backslashes are escaped too, so a
 * destination ending in `\` or containing `\)` cannot end the link early.
 */
export function escapeMarkdownDestination(value: string): string {
  return value.replace(/([\\()])/gu, '\\$1');
}

/** Escape a quoted link or image title. */
export function escapeMarkdownMetadata(value: string): string {
  return value.replace(/([\\"])/gu, '\\$1');
}

/** Reverse `escapeMarkdownDestination` for a standalone image line. */
export function unescapeMarkdownDestination(value: string): string {
  return value.replace(/\\([\\()])/gu, '$1');
}
