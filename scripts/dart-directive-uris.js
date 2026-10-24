// Extracts the URIs of `import` and `export` directives from Dart source.
//
// A small tokenizer, not a regex: comments (line, nested block, doc) and
// string literals (single/double, raw, triple-quoted, interpolated) are lexed
// properly, so a comment inside a directive, a second directive on the same
// line, or `import` text inside a string or comment cannot hide or fake a
// directive. A directive is `import`/`export` at brace depth 0 followed by a
// string literal; every string literal up to its `;` is a URI, including
// conditional `if (dart.library.x) 'alt.dart'` alternatives. Dart escapes
// (\n, \xHH, \uXXXX, \u{...}, \c) are decoded; an undecodable URI is
// reported as UNDECODABLE_URI so the caller fails closed.

const IDENT_START = /[A-Za-z_$]/u;
const IDENT_PART = /[A-Za-z0-9_$]/u;

/**
 * Lexes `source` from `start`. Returns `{ tokens, end }`. When `untilBrace`
 * is set (inside `${...}`), stops after the matching `}`.
 * Tokens: `{ type: 'id' | 'str' | 'punct', value }`; an interpolated string
 * has `value: null`.
 */
function lex(source, start = 0, untilBrace = false) {
  const tokens = [];
  let i = start;
  let depth = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (/\s/u.test(c)) {
      i++;
    } else if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      let nesting = 1;
      i += 2;
      while (i < n && nesting > 0) {
        if (source.startsWith('/*', i)) {
          nesting++;
          i += 2;
        } else if (source.startsWith('*/', i)) {
          nesting--;
          i += 2;
        } else {
          i++;
        }
      }
    } else if (
      c === "'" ||
      c === '"' ||
      ((c === 'r' || c === 'R') && (next === "'" || next === '"'))
    ) {
      const literal = lexString(source, i);
      tokens.push({ type: 'str', value: literal.value });
      i = literal.end;
    } else if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_PART.test(source[j])) j++;
      tokens.push({ type: 'id', value: source.slice(i, j) });
      i = j;
    } else {
      if (untilBrace && c === '{') depth++;
      if (untilBrace && c === '}') {
        if (depth === 0) return { tokens, end: i + 1 };
        depth--;
      }
      tokens.push({ type: 'punct', value: c });
      i++;
    }
  }
  return { tokens, end: n };
}

const SIMPLE_ESCAPES = {
  n: '\n',
  r: '\r',
  f: '\f',
  b: '\b',
  t: '\t',
  v: '\v',
};

/**
 * Decodes the Dart escape starting at the backslash `source[i]`. Returns
 * `{ text, end }`, or `{ text: null, end }` for a malformed escape.
 */
function decodeEscape(source, i) {
  const c = source[i + 1];
  if (c === undefined) return { text: null, end: i + 1 };
  if (c in SIMPLE_ESCAPES) return { text: SIMPLE_ESCAPES[c], end: i + 2 };
  // Malformed escapes consume only the backslash and letter, so the closing
  // quote is never swallowed.
  const malformed = { text: null, end: i + 2 };
  const codePoint = (hex, end) => {
    if (!/^[0-9a-fA-F]+$/u.test(hex)) return malformed;
    const value = Number.parseInt(hex, 16);
    return value <= 0x10ffff
      ? { text: String.fromCodePoint(value), end }
      : malformed;
  };
  if (c === 'x') return codePoint(source.slice(i + 2, i + 4), i + 4);
  if (c === 'u') {
    if (source[i + 2] === '{') {
      const close = source.indexOf('}', i + 3);
      const hex = close < 0 ? '' : source.slice(i + 3, close);
      if (hex.length < 1 || hex.length > 6) return malformed;
      return codePoint(hex, close + 1);
    }
    return codePoint(source.slice(i + 2, i + 6), i + 6);
  }
  // Any other escaped character stands for itself (\\, \', \$, \a).
  return { text: c, end: i + 2 };
}

function lexString(source, start) {
  let i = start;
  const raw = source[i] === 'r' || source[i] === 'R';
  if (raw) i++;
  const quote = source[i];
  const triple = source.startsWith(quote.repeat(3), i);
  const delimiter = triple ? quote.repeat(3) : quote;
  i += delimiter.length;
  if (triple) {
    // Dart drops a first line holding only whitespace (raw strings too).
    const leading = source.slice(i).match(/^[ \t]*\r?\n/u);
    if (leading) i += leading[0].length;
  }
  let value = '';
  // Interpolated or malformed literals have no static value.
  let interpolated = false;
  while (i < source.length) {
    if (source.startsWith(delimiter, i)) {
      return { value: interpolated ? null : value, end: i + delimiter.length };
    }
    const c = source[i];
    if (!triple && c === '\n') break;
    if (!raw && c === '\\') {
      const decoded = decodeEscape(source, i);
      if (decoded.text == null) interpolated = true;
      else value += decoded.text;
      i = decoded.end;
    } else if (!raw && c === '$') {
      interpolated = true;
      if (source[i + 1] === '{') {
        i = lex(source, i + 2, true).end;
      } else {
        i++;
      }
    } else {
      value += c;
      i++;
    }
  }
  return { value: null, end: i };
}

/**
 * Marker for a directive URI whose literal has no static value (malformed
 * escape or interpolation). Callers must treat it as a match (fail closed).
 */
const UNDECODABLE_URI = '\u0000undecodable';

/** Every URI of every top-level import/export directive in `source`. */
function directiveUris(source) {
  const { tokens } = lex(source);
  const uris = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'punct') {
      if (token.value === '{') depth++;
      if (token.value === '}') depth = Math.max(0, depth - 1);
      continue;
    }
    const isDirective =
      depth === 0 &&
      token.type === 'id' &&
      (token.value === 'import' || token.value === 'export') &&
      tokens[i + 1]?.type === 'str';
    if (!isDirective) continue;
    // Adjacent literals form one string ('package:a' 'b.dart').
    let pending = null;
    const flush = () => {
      if (pending != null) uris.push(pending);
      pending = null;
    };
    let j = i + 1;
    for (; j < tokens.length; j++) {
      const part = tokens[j];
      if (part.type === 'punct' && part.value === ';') break;
      if (part.type === 'str') {
        // A URI never contains a line break; treat one as undecodable.
        pending =
          part.value == null ||
          pending === UNDECODABLE_URI ||
          /[\r\n]/u.test(part.value)
            ? UNDECODABLE_URI
            : `${pending ?? ''}${part.value}`;
      } else {
        flush();
      }
    }
    flush();
    i = j;
  }
  return uris;
}

module.exports = { UNDECODABLE_URI, directiveUris, lex };
