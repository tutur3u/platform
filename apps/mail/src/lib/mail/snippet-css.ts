/**
 * Removes stylesheet text that leaked into mail preview text.
 *
 * Template engines (Laravel markdown mail, MJML exports) emit their
 * stylesheet at the start of the text/plain part, and stored snippets cut it
 * at an arbitrary character. Two rules keep prose safe:
 * - A block anywhere in the text is removed only when it is closed, its
 *   prelude is a known at-rule or a selector made of real HTML tags, classes,
 *   ids and attributes, and its declarations use known CSS properties.
 * - Unclosed blocks and a truncated header are removed only inside the
 *   leading stylesheet run, before any prose has appeared, or when a cut
 *   snippet ends inside a block of known declarations.
 * Braces are matched once and preludes and unclosed bodies are bounded, so
 * the pass is linear.
 */
const MAX_PRELUDE_LENGTH = 300;
// Stored snippets are at most a few hundred characters.
const MAX_UNCLOSED_BODY_LENGTH = 1_000;

const CSS_AT_RULE =
  /^@(?:-[a-z]+-)?(?:media|supports|font-face|import|keyframes|page|charset|namespace|layer|container|document|viewport)\b/u;

const HTML_TAG_NAMES = new Set(
  'a abbr address article aside b blockquote body br button caption center code col dd div dl dt em footer form h1 h2 h3 h4 h5 h6 head header hr html i img input label li main nav ol p pre section small span strong sub sup table tbody td tfoot th thead tr u ul'.split(
    ' '
  )
);

const CSS_PROPERTY_PREFIXES = [
  '-',
  'align',
  'all',
  'animation',
  'appearance',
  'background',
  'border',
  'bottom',
  'box-',
  'clear',
  'clip',
  'color',
  'content',
  'cursor',
  'direction',
  'display',
  'flex',
  'float',
  'font',
  'gap',
  'grid',
  'height',
  'justify',
  'left',
  'letter-spacing',
  'line-height',
  'list-style',
  'margin',
  'max-',
  'min-',
  'mso-',
  'object-',
  'opacity',
  'outline',
  'overflow',
  'padding',
  'position',
  'right',
  'src',
  'table-layout',
  'text-',
  'top',
  'transform',
  'transition',
  'unicode-range',
  'vertical-align',
  'visibility',
  'white-space',
  'width',
  'word-',
  'z-index',
];

function isCssProperty(name: string) {
  return CSS_PROPERTY_PREFIXES.some((prefix) => name.startsWith(prefix));
}

const COMPOUND_SELECTOR =
  /^(?:\*|[a-z][a-z\d]*)?(?:[.#][a-z_-][\w-]*|\[[^\]]{0,80}\]|::?[a-z-]+(?:\([^)]{0,40}\))?)*$/u;

/** A selector list built only from real tags, classes, ids and attributes. */
function isCssSelector(prelude: string, { partial = false } = {}) {
  if (!prelude || prelude.length > MAX_PRELUDE_LENGTH) return false;
  const selectors = prelude.split(',');
  return selectors.every((selector, selectorIndex) => {
    const compounds = selector.trim().split(/\s*[>+~]\s*|\s+/u);
    return compounds.every((compound, compoundIndex) => {
      const isLast =
        selectorIndex === selectors.length - 1 &&
        compoundIndex === compounds.length - 1;
      if (partial && isLast && /^[.#*:[]?[\w-]*$/u.test(compound)) return true;
      if (!compound || !COMPOUND_SELECTOR.test(compound)) return false;
      const tag = /^[a-z][a-z\d]*/u.exec(compound)?.[0];
      return tag === undefined || HTML_TAG_NAMES.has(tag);
    });
  });
}

const DECLARATION = /^\s*([a-z-]+)\s*:[^{}]*$/u;

const MAX_URL_LENGTH = 2_000;

/**
 * End index of a `url(…)` starting at `index`, or -1 when its `)` does not
 * follow within `MAX_URL_LENGTH` code points.
 */
function urlEnd(body: string, index: number) {
  let cursor = index + 4;
  for (let count = 0; cursor < body.length; count += 1) {
    if (body[cursor] === ')') return cursor + 1;
    if (count === MAX_URL_LENGTH) return -1;
    cursor += (body.codePointAt(cursor) ?? 0) > 0xffff ? 2 : 1;
  }
  return -1;
}

/**
 * Splits a declaration body on `;` with each `url(…)` reduced to `url()`.
 * Returns null at the first brace outside a url: such a body holds a nested
 * block, not declarations. Stopping there keeps nested input linear, because
 * each block is read only up to its first child.
 */
function declarationParts(body: string) {
  const parts: string[] = [];
  let part = '';
  let segment = 0;
  let cursor = 0;
  while (cursor < body.length) {
    const char = body[cursor];
    if (char === '{' || char === '}') return null;
    if (char === ';') {
      parts.push(part + body.slice(segment, cursor));
      part = '';
      cursor += 1;
      segment = cursor;
      continue;
    }
    if (char === 'u' && body.startsWith('url(', cursor)) {
      const end = urlEnd(body, cursor);
      if (end !== -1) {
        part += `${body.slice(segment, cursor)}url()`;
        cursor = end;
        segment = cursor;
        continue;
      }
    }
    cursor += 1;
  }
  parts.push(part + body.slice(segment));
  return parts;
}

/**
 * True when every declaration uses a known property. With `truncated`, the
 * final segment may be cut anywhere.
 */
function isDeclarationBody(body: string, truncated: boolean) {
  const parts = declarationParts(body);
  if (parts === null) return false;
  let known = 0;
  for (const [partIndex, part] of parts.entries()) {
    if (!part.trim()) continue;
    const name = DECLARATION.exec(part)?.[1];
    if (name && isCssProperty(name)) {
      known += 1;
      continue;
    }
    const isCutTail = truncated && partIndex === parts.length - 1;
    const tail = part.trim();
    // A cut tail must still be on its way to a known property name.
    const isPropertyStart =
      /^[a-z-]*$/u.test(tail) &&
      CSS_PROPERTY_PREFIXES.some(
        (prefix) => prefix.startsWith(tail) || tail.startsWith(prefix)
      );
    if (isCutTail && isPropertyStart) {
      known += 1;
      continue;
    }
    return false;
  }
  return known > 0 || !body.trim();
}

/** True when an at-rule body holds rule blocks or known declarations. */
function isAtRuleBody(prelude: string, body: string, truncated: boolean) {
  if (/^@(?:-[a-z]+-)?(?:font-face|page|viewport)\b/u.test(prelude)) {
    return isDeclarationBody(body, truncated);
  }
  const inner = body.indexOf('{');
  if (inner === -1) {
    return (
      isDeclarationBody(body, truncated) ||
      (truncated && isCssSelector(body.trim(), { partial: true }))
    );
  }
  const nested = body.slice(0, inner).trim();
  return isCssSelector(nested) || CSS_AT_RULE.test(nested);
}

/** The prelude starts after the previous block, statement or line boundary. */
function preludeBounds(value: string, from: number, open: number) {
  const floor = Math.max(from, open - MAX_PRELUDE_LENGTH);
  for (let cursor = open - 1; cursor >= floor; cursor -= 1) {
    const char = value[cursor];
    if (char === '{' || char === '}' || char === ';' || char === '\n') {
      return cursor + 1;
    }
  }
  return floor;
}

/** Matching close index for every `{`, in one linear pass. */
function matchBraces(value: string) {
  const closeOf = new Map<number, number>();
  const stack: number[] = [];
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    const char = value[cursor];
    if (char === '{') stack.push(cursor);
    else if (char === '}') {
      const open = stack.pop();
      if (open !== undefined) closeOf.set(open, cursor);
    }
  }
  return closeOf;
}

const TRUNCATION_MARK = /(?:\.\.\.|…)\s*$/u;

/** A cut stylesheet header (`@media only scr...`, `table, td...`). */
function isTruncatedHeader(rest: string, afterCss: boolean) {
  const header = rest.replace(TRUNCATION_MARK, '').trim();
  if (!header || header.length > MAX_PRELUDE_LENGTH) return false;
  if (/^@[a-z-]*$/u.test(header) || CSS_AT_RULE.test(header)) return true;
  // A bare word opening the text could be prose; after a removed rule it
  // continues the stylesheet.
  const punctuated = afterCss || /[.#,:[*>]/u.test(header);
  return punctuated && isCssSelector(header, { partial: true });
}

export function stripLeakedCss(value: string) {
  const truncated = TRUNCATION_MARK.test(value);
  if (!value.includes('{') && !truncated) return value;
  const closeOf = matchBraces(value);
  let output = '';
  let index = 0;
  let removed = false;
  let hasProse = false;
  while (index < value.length) {
    const leading = !hasProse;
    const open = value.indexOf('{', index);
    if (open === -1) {
      const rest = value.slice(index);
      const header = leading && truncated && isTruncatedHeader(rest, removed);
      if (!header) output += rest;
      break;
    }
    const start = preludeBounds(value, index, open);
    const raw = value.slice(start, open);
    const atMatch = /(?:^|\s)@[a-z-]/u.exec(raw);
    const atOffset = atMatch ? atMatch.index + atMatch[0].indexOf('@') : -1;
    const atPrelude = atOffset === -1 ? '' : raw.slice(atOffset).trim();
    const isAtRule = atPrelude !== '' && CSS_AT_RULE.test(atPrelude);
    const preludeStart = isAtRule ? start + atOffset : start;
    const prelude = isAtRule ? atPrelude : raw.trim();
    const preludeLeading =
      leading && value.slice(index, preludeStart).trim() === '';
    if (isAtRule || isCssSelector(prelude)) {
      const close = closeOf.get(open) ?? -1;
      const unclosed = close === -1;
      const body = unclosed
        ? value
            .slice(open + 1, open + 1 + MAX_UNCLOSED_BODY_LENGTH)
            .replace(TRUNCATION_MARK, '')
        : value.slice(open + 1, close);
      // An unclosed block counts only at the start or in a cut snippet.
      const cut = unclosed && (preludeLeading || truncated);
      const isCss = unclosed
        ? cut &&
          (isAtRule
            ? isAtRuleBody(atPrelude, body, true)
            : isDeclarationBody(body, true))
        : isAtRule
          ? isAtRuleBody(atPrelude, body, false)
          : isDeclarationBody(body, false);
      if (isCss) {
        const kept = value.slice(index, preludeStart);
        if (kept.trim()) hasProse = true;
        output += `${kept} `;
        removed = true;
        if (unclosed) break;
        index = close + 1;
        continue;
      }
    }
    const kept = value.slice(index, open + 1);
    if (kept.trim()) hasProse = true;
    output += kept;
    index = open + 1;
  }
  return output;
}
