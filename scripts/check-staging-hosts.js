const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const NON_PRODUCTION_LABEL =
  /^(staging|beta|cutover|dev|test|qa|next|rc|sandbox|canary|preview)$/;
// Ends at the zone, not inside a longer label or a lookalike parent zone.
const ZONE_HOST = /(?:[a-z0-9_*-]+\.)*tuturuuu\.com(?![a-z0-9-]|\.[a-z0-9])/g;
const STAGING_ALLOWLIST =
  /\b[\w$]*staging[\w$]*(?:host|domain|origin|zone|pattern|allow)[\w$]*\s*(?::[^=\n]*)?(?:=|:)[\s\S]*?(?:;|\n\s*\n|$)/g;
const SIMPLE_STRING_CONSTANT =
  /\b(?:const|let|var)\s+([a-z_$][\w$]*)\s*=\s*(['"`])([a-z0-9.*_-]+)\2/g;
// Deny-lists that stop managed projects from claiming production names.
const RESERVED_LIST_FILES = [
  'apps/infrastructure/src/lib/infrastructure/projects.ts',
  'apps/web/src/lib/infrastructure/project-model.ts',
  'scripts/watch-blue-green/projects.js',
];
const RESERVED_LIST =
  /const reserved_managed_project_hostnames = new set\(\[[^\]]*\]\)/g;
const RESERVED_LABELS = ['dev', 'staging'];
const RESERVED_LIST_ENTRY = new RegExp(
  `(['"])(?:${RESERVED_LABELS.join('|')})\\.tuturuuu\\.com\\1`,
  'g'
);
const SCANNED_FILE =
  /(?:\.(?:[cm]?[jt]sx?|jsonc?|json5|toml|ya?ml|env|vars|sh|bash|py|sql|html?|tf|conf|ini|properties|rs|dart|go|swift|kt)|(?:^|\/)(?:dockerfile[^/]*|\.env[^/]*|\.dev\.vars[^/]*))$/i;
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

/**
 * Rewrites source so hosts hidden by case, escapes, string concatenation or
 * template interpolation of simple same-file constants read as literal text.
 */
function normalizeSource(source) {
  let text = source
    .toLowerCase()
    .replace(/%2e|\\x2e|\\u002e|\\u\{2e\}|\[\.\]/g, '.')
    .replace(/\\+\./g, '.');
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

function nonProductionHost(host) {
  const labels = normalizeHost(host).slice(0, -'tuturuuu.com'.length);
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

function violations(source, file = '') {
  let text = normalizeSource(source);
  if (RESERVED_LIST_FILES.includes(file))
    text = text.replace(RESERVED_LIST, (list) =>
      list.replace(RESERVED_LIST_ENTRY, "''")
    );
  const found = [];
  for (const [declaration] of text.matchAll(STAGING_ALLOWLIST))
    if (/tuturuuu\.com(?![a-z0-9-])/.test(declaration))
      found.push('production cookie domain in staging allowlist');
  for (const match of text.matchAll(ZONE_HOST)) {
    const host = normalizeHost(match[0]);
    if (nonProductionHost(host)) {
      found.push(host);
      continue;
    }
    const prefix = dynamicPrefix(text, match.index);
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
    for (const host of violations(source, file))
      failures.push(`${file}: ${host}`);
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
  violations,
};
