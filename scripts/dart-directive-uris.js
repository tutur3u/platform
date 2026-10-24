// Extracts the URIs of `import` and `export` directives from Dart source.
//
// A small tokenizer, not a regex: comments (line, nested block, doc) and
// string literals (single/double, raw, triple-quoted, interpolated) are lexed
// properly, so a comment inside a directive, a second directive on the same
// line, or `import` text inside a string or comment cannot hide or fake a
// directive. A directive is `import`/`export` at brace depth 0 followed by a
// string literal; every string literal up to its `;` is a URI, including
// conditional `if (dart.library.x) 'alt.dart'` alternatives.

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

function lexString(source, start) {
  let i = start;
  const raw = source[i] === 'r' || source[i] === 'R';
  if (raw) i++;
  const quote = source[i];
  const triple = source.startsWith(quote.repeat(3), i);
  const delimiter = triple ? quote.repeat(3) : quote;
  i += delimiter.length;
  let value = '';
  let interpolated = false;
  while (i < source.length) {
    if (source.startsWith(delimiter, i)) {
      return { value: interpolated ? null : value, end: i + delimiter.length };
    }
    const c = source[i];
    if (!triple && c === '\n') break;
    if (!raw && c === '\\') {
      value += source[i + 1] ?? '';
      i += 2;
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
        if (part.value != null) pending = `${pending ?? ''}${part.value}`;
      } else {
        flush();
      }
    }
    flush();
    i = j;
  }
  return uris;
}

module.exports = { directiveUris, lex };
