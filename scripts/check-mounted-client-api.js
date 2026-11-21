#!/usr/bin/env node

/**
 * Learn, Teach, Nova and Admin are mounted under tuturuuu.com/<app>
 * (Admin is /admin, source in apps/admin). A root-relative fetch('/api/...')
 * from those pages hits Web. Client calls and raw anchors go through each
 * app's mountedFetch / appApiPath. Raw calls are allowed only for verified
 * Web passthroughs in scripts/mounted-client-api-allowlist.json.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const APPS = ['learn', 'teach', 'nova', 'admin'];
const ALLOWLIST_PATH = 'scripts/mounted-client-api-allowlist.json';
const SKIP_DIR = new Set(['node_modules', 'start-bridge', 'cloudflare', 'api']);

function matchRoute(pattern, pathname) {
  const route = pattern.split('/').filter(Boolean);
  const parts = pathname.split('/').filter(Boolean);
  for (let i = 0; i < route.length; i++) {
    const segment = route[i];
    const catchAll = /^\[(\[)?\.\.\.(\w+)\]\]?$/u.exec(segment);
    if (catchAll?.[2]) {
      const optional = catchAll[1] === '[';
      const rest = parts.slice(i);
      if (!optional && rest.length === 0) return null;
      return {};
    }
    const dynamic = /^\[(\w+)\]$/u.exec(segment);
    const value = parts[i];
    if (value === undefined) return null;
    if (!dynamic && segment !== value) return null;
  }
  return route.length === parts.length ? {} : null;
}

function pathnameOf(raw) {
  let pathname = '';
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '?' || char === '#') break;
    if (char === '$' && raw[i + 1] === '{') {
      const close = raw.indexOf('}', i + 2);
      pathname += '_';
      i = close === -1 ? raw.length : close;
      continue;
    }
    pathname += char;
  }
  return pathname;
}

function isApiPath(value) {
  return (
    value === '/api' || value.startsWith('/api/') || value.startsWith('/api?')
  );
}

function loadAllowlist(rootDir) {
  const file = path.join(rootDir, ALLOWLIST_PATH);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadPatterns(rootDir, app) {
  const file = path.join(
    rootDir,
    'apps',
    app,
    'src/start-bridge/api-patterns.bridge.gen.ts'
  );
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/"(\/api[^"]*)"/g)].map((match) => match[1]);
}

function isIdentStart(char) {
  return /[A-Za-z_$]/u.test(char);
}

function isIdent(char) {
  return /[\w$]/u.test(char);
}

function skipSpace(source, index) {
  let i = index;
  while (i < source.length) {
    if (source[i] === '/' && source[i + 1] === '/') {
      const next = source.indexOf('\n', i + 2);
      i = next === -1 ? source.length : next + 1;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      const next = source.indexOf('*/', i + 2);
      i = next === -1 ? source.length : next + 2;
      continue;
    }
    if (
      source[i] === ' ' ||
      source[i] === '\n' ||
      source[i] === '\r' ||
      source[i] === '\t'
    ) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function readString(source, index) {
  const quote = source[index];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let value = '';
  let escaped = false;
  let depth = 0;
  for (let i = index + 1; i < source.length; i++) {
    const char = source[i];
    if (quote === '`') {
      if (escaped) {
        value += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        value += char;
        continue;
      }
      if (char === '$' && source[i + 1] === '{') {
        depth++;
        value += '${';
        i++;
        continue;
      }
      if (char === '{') {
        if (depth > 0) depth++;
        value += char;
        continue;
      }
      if (char === '}' && depth > 0) {
        depth--;
        value += char;
        continue;
      }
      if (depth === 0 && char === '`') {
        return { value, end: i + 1, quote };
      }
      value += char;
      continue;
    }
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === quote) return { value, end: i + 1, quote };
    value += char;
  }
  return null;
}

function stringLiterals(text) {
  const values = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '/' && text[i + 1] === '/') {
      const next = text.indexOf('\n', i + 2);
      i = next === -1 ? text.length : next;
      continue;
    }
    if (char === '/' && text[i + 1] === '*') {
      const next = text.indexOf('*/', i + 2);
      i = next === -1 ? text.length : next + 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const literal = readString(text, i);
      if (!literal) break;
      values.push(literal.value);
      i = literal.end - 1;
    }
  }
  return values;
}

function readFirstArgument(source, openParen) {
  const start = skipSpace(source, openParen + 1);
  let depth = 1;
  let quote = null;
  let escaped = false;
  let templateDepth = 0;
  let end = source.length;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quote === '`') {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '$' && source[i + 1] === '{') {
        templateDepth++;
        i++;
        continue;
      }
      if (char === '{' && templateDepth > 0) {
        templateDepth++;
        continue;
      }
      if (char === '}' && templateDepth > 0) {
        templateDepth--;
        continue;
      }
      if (templateDepth === 0 && char === '`') quote = null;
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && source[i + 1] === '/') {
      const next = source.indexOf('\n', i + 2);
      i = next === -1 ? source.length - 1 : next;
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      const next = source.indexOf('*/', i + 2);
      i = next === -1 ? source.length - 1 : next + 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') {
      depth++;
      continue;
    }
    if (char === ')' || char === ']' || char === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
      continue;
    }
    if (char === ',' && depth === 1) {
      end = i;
      break;
    }
  }
  return { text: source.slice(start, end), start, end };
}

function pathsForIdent(source, before, name) {
  const region = source.slice(0, before);
  const pattern = new RegExp(`(?:^|[^\\w.$])${name}\\s*=(?!=)`, 'g');
  let match = null;
  let last = null;
  while ((match = pattern.exec(region))) last = match;
  if (!last) return [];
  const rhs = region.slice(last.index + last[0].length);
  const chunk = rhs.split(';')[0] ?? '';
  return stringLiterals(chunk).filter(isApiPath);
}

function wordBefore(source, index) {
  const prev = source[index - 1];
  return prev !== undefined && /[.\w$]/u.test(prev);
}

function analyzeSource(source) {
  const calls = [];
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '/' && source[i + 1] === '/') {
      const next = source.indexOf('\n', i + 2);
      i = next === -1 ? source.length : next;
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      const next = source.indexOf('*/', i + 2);
      i = next === -1 ? source.length : next + 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const literal = readString(source, i);
      if (!literal) break;
      i = literal.end - 1;
      continue;
    }
    if (!isIdentStart(char)) continue;
    const start = i;
    i++;
    while (i < source.length && isIdent(source[i])) i++;
    const ident = source.slice(start, i);
    if (wordBefore(source, start)) {
      i--;
      continue;
    }
    if (ident === 'fetch') {
      const paren = skipSpace(source, i);
      if (source[paren] !== '(') {
        i--;
        continue;
      }
      const arg = readFirstArgument(source, paren);
      const direct = stringLiterals(arg.text).filter(isApiPath);
      const identMatch = /^[A-Za-z_$][\w$]*$/u.exec(arg.text.trim());
      const paths = direct.length
        ? direct
        : identMatch
          ? pathsForIdent(source, arg.start, identMatch[0])
          : [];
      if (paths.length) {
        calls.push({
          kind: 'fetch',
          line: lineOf(source, start),
          identStart: start,
          identEnd: start + ident.length,
          paths,
        });
      }
      i = Math.max(i, arg.end);
      continue;
    }
    if (ident === 'api' || ident === 'href') {
      const mark = skipSpace(source, i);
      const separator = ident === 'api' ? ':' : '=';
      if (source[mark] !== separator) {
        i--;
        continue;
      }
      let valueAt = skipSpace(source, mark + 1);
      if (ident === 'href' && source[valueAt] === '{') {
        valueAt = skipSpace(source, valueAt + 1);
      }
      const literal = readString(source, valueAt);
      if (literal && isApiPath(literal.value)) {
        calls.push({
          kind: ident === 'api' ? 'api-prop' : 'href',
          line: lineOf(source, start),
          stringStart: valueAt,
          stringEnd: literal.end,
          paths: [literal.value],
        });
        i = literal.end;
        continue;
      }
    }
    i--;
  }
  return calls;
}

function allowed(allowlist, app, rawPath) {
  const pathname = pathnameOf(rawPath);
  const entries = allowlist[app] ?? [];
  return entries.some((entry) => matchRoute(entry.pattern, pathname));
}

function owned(patterns, rawPath) {
  const pathname = pathnameOf(rawPath);
  return patterns.some((pattern) => matchRoute(pattern, pathname));
}

function violationsInSource(source, app, allowlist, patterns) {
  return analyzeSource(source).flatMap((call) => {
    const blocked = call.paths.filter(
      (rawPath) => !allowed(allowlist, app, rawPath)
    );
    if (!blocked.length) return [];
    const label = blocked
      .map((rawPath) => {
        const where = owned(patterns, rawPath)
          ? 'app-owned; use mountedFetch or appApiPath'
          : 'not an allowlisted Web passthrough';
        return `${pathnameOf(rawPath)} (${where})`;
      })
      .join(', ');
    const noun =
      call.kind === 'api-prop'
        ? 'transport'
        : call.kind === 'href'
          ? 'href'
          : 'fetch';
    return [
      {
        line: call.line,
        message: `raw /api ${noun}: ${label}`,
      },
    ];
  });
}

function shouldScan(file) {
  if (!/\.(ts|tsx)$/u.test(file)) return false;
  if (/\.(test|spec)\./u.test(file)) return false;
  const parts = file.split(path.sep);
  if (parts.includes('app') && parts.includes('api')) return false;
  if (parts.some((part) => SKIP_DIR.has(part) && part !== 'api')) return false;
  if (file.endsWith(`${path.sep}lib${path.sep}mounted-api.ts`)) return false;
  if (file.endsWith(`${path.sep}proxy.ts`)) return false;
  return true;
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'start-bridge' ||
      entry.name === 'cloudflare'
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'api' && path.basename(dir) === 'app') continue;
      walk(full, out);
      continue;
    }
    if (shouldScan(full)) out.push(full);
  }
}

function collectViolations({
  rootDir = ROOT_DIR,
  allowlist,
  patternsByApp,
} = {}) {
  const list = allowlist ?? loadAllowlist(rootDir);
  const violations = [];
  for (const app of APPS) {
    const patterns = patternsByApp?.[app] ?? loadPatterns(rootDir, app);
    const files = [];
    walk(path.join(rootDir, 'apps', app, 'src'), files);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const hit of violationsInSource(source, app, list, patterns)) {
        violations.push(
          `${path.relative(rootDir, file)}:${hit.line}: ${hit.message}`
        );
      }
    }
  }
  return violations.sort();
}

function main() {
  const violations = collectViolations();
  if (violations.length > 0) {
    console.error(
      `mounted-client-api: ${violations.length} raw /api call(s) outside mountedFetch/appApiPath`
    );
    for (const line of violations) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log(
    'mounted-client-api: learn, teach, nova and admin client /api calls use the mount resolver'
  );
}

if (require.main === module) main();

module.exports = {
  ALLOWLIST_PATH,
  APPS,
  analyzeSource,
  collectViolations,
  loadAllowlist,
  loadPatterns,
  matchRoute,
  pathnameOf,
  violationsInSource,
};
