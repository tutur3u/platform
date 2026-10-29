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
const SIMPLE_STRING_CONSTANT =
  /\b(?:const|let|var)\s+([a-z_$][\w$]*)\s*=\s*(['"`])([a-z0-9.*_-]+)\2/g;
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
    // Percent, hex, unicode, octal and HTML-entity escapes, bracketed dots,
    // and the fullwidth/ideographic dots that IDNA maps to a full stop.
    .replace(
      /%2e|\\x2e|\\u0*2e|\\u\{0*2e\}|\\0?56(?![0-7])|&#0*46;|&#x0*2e;|&period;|\[\.\]|[\uff0e\u3002\uff61]/g,
      '.'
    )
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

function violations(source) {
  const text = normalizeSource(source);
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
    if (host !== PRODUCTION_ZONE) continue;
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
    for (const host of violations(source)) failures.push(`${file}: ${host}`);
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
