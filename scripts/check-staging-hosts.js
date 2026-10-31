const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const NON_PRODUCTION_LABEL =
  /^(staging|beta|cutover|dev|test|qa|next|rc|sandbox|canary|preview)$/;
const PRODUCTION_ZONE = 'tuturuuu.com';
// A whole dotted hostname: it never starts or ends inside a longer label, so
// `tuturuuu.com.attacker.net` and `eviltuturuuu.com` are single foreign hosts.
const HOST_TOKEN =
  /(?<![a-z0-9_*-])(?:[a-z0-9_*-]+\.)+[a-z0-9-]+(?![a-z0-9_*-]|\.[a-z0-9])/g;
const STAGING_ALLOWLIST =
  /\b[\w$]*staging[\w$]*(?:host|domain|origin|zone|pattern|allow)[\w$]*\s*(?::[^=\n]*)?(?:=|:)[\s\S]*?(?:;|\n\s*\n|$)/g;
const ESCAPED_CHARACTER =
  /\\x([0-9a-f]{2})|\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\([0-3]?[0-7]{1,2})(?![0-7])|&#0*(\d{1,7});|&#x0*([0-9a-f]{1,6});/g;
const SIMPLE_STRING_CONSTANT =
  /\b(?:const|let|var)\s+([a-z_$][\w$]*)\s*=\s*(['"`])([a-z0-9.*_-]+)\2/g;
const SCANNED_FILE =
  /(?:\.(?:[cm]?[jt]sx?|jsonc?|json5|toml|ya?ml|env|vars|sh|bash|py|sql|html?|tf|conf|ini|properties|rs|dart|go|swift|kt)|(?:^|\/)(?:dockerfile[^/]*|\.env[^/]*|\.dev\.vars[^/]*))$/i;
// Only these languages have C-style comments. Elsewhere `/*` is a shell glob,
// SQL or YAML text, so stripping it could swallow a real staging host.
const C_COMMENT_FILE = /\.(?:[cm]?[jt]sx?|css|scss|sass|less|pcss)$/i;
const SKIPPED_FILE =
  /\.(?:test|spec)\.|(?:^|\/)(?:__tests__|fixtures?)\/|\.(?:md|mdx|lock)$|(?:^|\/)bun\.lock$/i;

/** Lowercase, trim, and strip any scheme, userinfo, path, port and trailing dot. */
function normalizeHost(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^[^@]*@/, '')
    .replace(/:\d*$/, '')
    .replace(/\.+$/, '');
}

const BLOCK_PAREN_KEYWORD = /^(?:if|while|for|with)$/;
const REGEX_KEYWORD =
  /^(?:return|typeof|case|do|else|in|of|void|delete|throw|new|yield|await|instanceof)$/;
// A `/` straight after one of these starts a regex literal.
const REGEX_PRECEDER = /[(,=:[!&|?{;+\-*%<>~^/]/;
const WORD_CHARACTER = /[\p{L}\p{N}_$]/u;
// More ambiguous `/` sites than this and every comment is kept (fail closed).
const MAX_LEX_PATHS = 64;

/** End index (exclusive) of a regex literal with its flags at `start`, or -1. */
function regexLiteralEnd(source, start) {
  if (source[start + 1] === '/' || source[start + 1] === '*') return -1;
  let inClass = false;
  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];
    if (char === '\n') return -1;
    if (char === '\\') i++;
    else if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) {
      // `/*` or `//` right after the closer is a comment, so this was division.
      if (source[i + 1] === '*' || source[i + 1] === '/') return -1;
      while (/[a-z]/i.test(source[i + 1] ?? '')) i++;
      return i + 1;
    }
  }
  return -1;
}

// One lexing pass that preserves string and regex literals and removes
// comments. `slash` is what a `/` would mean after the previous token, taken
// from tokens only (comments and whitespace are skipped, with no lookback
// window). After a `}` it cannot be known without a parser, so `choices[n]`
// picks regex (true) or division for the n-th such site; the caller runs every
// combination. An unterminated `/*` is never valid code, so it is kept.
function stripComments(source, choices = []) {
  const result = [];
  const parens = [];
  let quote = null;
  let slash = 'regex';
  let word = null;
  let punct = '';
  let sites = 0;
  let noCloser = false;
  const closerAfter = (from) => {
    const closer = noCloser ? -1 : source.indexOf('*/', from);
    if (closer === -1) noCloser = true;
    return closer;
  };
  const token = (next, nextWord = null, nextPunct = '') => {
    slash = next;
    word = nextWord;
    punct = nextPunct;
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const closer =
      char === '/' && source[i + 1] === '*' ? closerAfter(i + 2) : -1;
    if (quote) {
      result.push(char);
      if (char === '\\') result.push(source[++i] ?? '');
      else if (char === quote) {
        quote = null;
        token('division');
      }
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char;
      result.push(char);
    } else if (closer !== -1) {
      i = closer + 1;
      result.push(' ');
    } else if (char === '/' && source[i + 1] === '/' && source[i - 1] !== ':') {
      while (i < source.length && source[i] !== '\n') i++;
      result.push('\n');
    } else if (char <= ' ') {
      result.push(char);
    } else if (WORD_CHARACTER.test(char)) {
      let end = i + 1;
      while (end < source.length && WORD_CHARACTER.test(source[end])) end++;
      const text = source.slice(i, end);
      const property = punct === '.';
      result.push(text);
      token(!property && REGEX_KEYWORD.test(text) ? 'regex' : 'division', {
        text,
        property,
      });
      i = end - 1;
    } else if (char === '/') {
      const end = slash === 'division' ? -1 : regexLiteralEnd(source, i);
      let regex = end !== -1 && slash === 'regex';
      if (end !== -1 && slash === 'either') regex = choices[sites++] ?? false;
      if (regex) {
        result.push(source.slice(i, end));
        token('division');
        i = end - 1;
      } else {
        result.push(char);
        token('regex', null, char);
      }
    } else {
      result.push(char);
      if (char === '(') {
        parens.push(
          !!word && !word.property && BLOCK_PAREN_KEYWORD.test(word.text)
        );
        token('regex', null, char);
      } else if (char === ')')
        token(parens.pop() ? 'regex' : 'division', null, char);
      else if (char === ']' || char === '.') token('division', null, char);
      else if (char === '}') token('either', null, char);
      else if (char === '+' || char === '-')
        token(punct === char ? 'division' : 'regex', null, char);
      else token(REGEX_PRECEDER.test(char) ? 'regex' : 'either', null, char);
    }
  }
  return { text: result.join(''), sites };
}

/**
 * Every plausible comment-stripped reading of the source. Regex versus
 * division is undecidable without a parser, so each ambiguous `/` is tried both
 * ways and a host visible in any reading is reported. Past MAX_LEX_PATHS
 * readings the unstripped source is returned, so comments are scanned too.
 * A `file` outside the C-comment languages is never stripped; omit it to strip.
 */
function stripCommentVariants(source, file) {
  if (file !== undefined && !C_COMMENT_FILE.test(file)) return [source];
  const variants = new Set();
  const pending = [[]];
  for (let runs = 0; pending.length; runs++) {
    if (runs === MAX_LEX_PATHS) return [source];
    const choices = pending.pop();
    const { text, sites } = stripComments(source, choices);
    variants.add(text);
    for (let site = choices.length; site < sites; site++)
      pending.push([
        ...choices,
        ...Array(site - choices.length).fill(false),
        true,
      ]);
  }
  return [...variants];
}

/**
 * Rewrites source so hosts hidden by case, escapes, string concatenation or
 * template interpolation of simple same-file constants read as literal text.
 */
function normalizeSource(source, stripped = stripCommentVariants(source)[0]) {
  let text = stripped
    // Fold fullwidth and other compatibility letters and digits to ASCII.
    .normalize('NFKC')
    .toLowerCase()
    // Hex, unicode, octal and numeric-entity escapes of hostname characters.
    .replace(
      ESCAPED_CHARACTER,
      (match, hex, braced, unicode, octal, dec, hexEntity) => {
        const code =
          octal !== undefined
            ? Number.parseInt(octal, 8)
            : dec !== undefined
              ? Number(dec)
              : Number.parseInt(hex ?? braced ?? unicode ?? hexEntity, 16);
        const character =
          code <= 0x10ffff
            ? String.fromCodePoint(code)
                .normalize('NFKC')
                .toLowerCase()
                .replace(/[\u3002\uff61]/, '.')
            : '';
        return /^[a-z0-9.-]$/.test(character) ? character : match;
      }
    )
    // Percent, hex, unicode, octal and HTML-entity escapes, bracketed dots,
    // and the fullwidth/ideographic dots that IDNA maps to a full stop.
    .replace(
      /%2e|\\x2e|\\u0*2e|\\u\{0*2e\}|\\0?56(?![0-7])|&#0*46;|&#x0*2e;|&period;|\[\.\]|[\uff0e\u3002\uff61]/g,
      '.'
    )
    // Starts only at a run of backslashes, so long runs stay linear.
    .replace(/(?<!\\)\\+(?=\.)/g, '');
  const constants = new Map(
    [...text.matchAll(SIMPLE_STRING_CONSTANT)].map(([, name, , value]) => [
      name,
      value,
    ])
  );
  const joinLiterals = (value) => value.replace(/(['"`])\s*\+\s*(['"`])/g, '');
  text = joinLiterals(text)
    .replace(/\$\{\s*(['"])([^'"`]*)\1\s*\}/g, '$2')
    .replace(/\$\{\s*([a-z_$][\w$]*)\s*\}/g, (match, name) =>
      constants.has(name) ? constants.get(name) : match
    )
    .replace(/(['"`])\s*\+\s*([a-z_$][\w$]*)\b/g, (match, _quote, name) =>
      constants.has(name) ? constants.get(name) : match
    )
    .replace(/\b([a-z_$][\w$]*)\s*\+\s*(['"`])/g, (match, name) =>
      constants.has(name) ? constants.get(name) : match
    );
  return joinLiterals(text);
}

/** Exact comparison of a parsed hostname against the production cookie zone. */
function inProductionZone(host) {
  return host === PRODUCTION_ZONE || host.endsWith(`.${PRODUCTION_ZONE}`);
}

function productionZoneHosts(text) {
  return [...text.matchAll(HOST_TOKEN)]
    .map((match) => ({ host: normalizeHost(match[0]), index: match.index }))
    .filter(({ host }) => inProductionZone(host));
}

function nonProductionHost(host) {
  const labels = host.slice(0, -PRODUCTION_ZONE.length);
  return labels.split(/[.-]/).some((label) => NON_PRODUCTION_LABEL.test(label));
}

/** Expression text just before a zone match, e.g. `(staging|preview)`. */
function dynamicPrefix(text, index) {
  const start = Math.max(
    text.lastIndexOf('\n', index - 1),
    ...[' ', '"', "'", '`', ',', '=', ':', '['].map((separator) =>
      text.lastIndexOf(separator, index - 1)
    )
  );
  return text.slice(start + 1, index).replace(/[.-]+$/, '');
}

function violations(source, file) {
  const variants = stripCommentVariants(source, file).map((stripped) =>
    sourceViolations(normalizeSource(source, stripped))
  );
  return variants.length === 1 ? variants[0] : [...new Set(variants.flat())];
}

function sourceViolations(text) {
  const found = [];
  if (!text.includes('tuturuuu')) return found;
  for (const [declaration] of text.matchAll(STAGING_ALLOWLIST))
    if (productionZoneHosts(declaration).length)
      found.push('production cookie domain in staging allowlist');
  for (const { host, index } of productionZoneHosts(text)) {
    if (nonProductionHost(host)) {
      found.push(host);
      continue;
    }
    const prefix = dynamicPrefix(text, index);
    if (
      /[)\]}|*+]$/.test(prefix) &&
      prefix
        .split(/[^a-z0-9]+/)
        .some((label) => NON_PRODUCTION_LABEL.test(label))
    )
      found.push(`${prefix}.${host}`);
  }
  return found;
}

function scannedFile(file) {
  return SCANNED_FILE.test(file) && !SKIPPED_FILE.test(file);
}

function check(root = process.cwd()) {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16777216,
  }).split('\0');
  const failures = [];
  for (const file of files) {
    if (!file || !scannedFile(file)) continue;
    let source;
    try {
      source = readFileSync(path.join(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const host of violations(source, file)) failures.push(`${file}: ${host}`);
  }
  return failures;
}

if (require.main === module) {
  const failures = check();
  if (failures.length) {
    console.error(`Use <app>.staging.tutur3u.com:\n${failures.join('\n')}`);
    process.exitCode = 1;
  }
}
module.exports = {
  check,
  normalizeHost,
  normalizeSource,
  scannedFile,
  stripCommentVariants,
  violations,
};
