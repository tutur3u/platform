const fs = require('node:fs');

// Keep in sync with `Env.releaseRequiredUrlDefines` and
// `Env.releaseOptionalUrlDefines` in apps/mobile/lib/core/config/env.dart.
// Release builds send credentials and bearer tokens to these origins, so a
// missing or cleartext value must fail the build rather than ship.
const REQUIRED_URL_DEFINES = ['NEXT_PUBLIC_SUPABASE_URL', 'API_BASE_URL'];
const OPTIONAL_URL_DEFINES = [
  'TASKS_API_BASE_URL',
  'FINANCE_API_BASE_URL',
  'INVENTORY_API_BASE_URL',
  'CONTACTS_API_BASE_URL',
  'CALENDAR_API_BASE_URL',
  'TEACH_API_BASE_URL',
  'TRACK_API_BASE_URL',
  'MAIL_API_BASE_URL',
  'INFRASTRUCTURE_API_BASE_URL',
];

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    (trimmed[0] === '"' || trimmed[0] === "'") &&
    trimmed.at(-1) === trimmed[0]
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Parses the `.json` or `.env` formats accepted by --dart-define-from-file. */
function parseDartDefineFile(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value)])
    );
  }

  const defines = {};
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line
      .slice(0, separator)
      .trim()
      .replace(/^export\s+/u, '');
    defines[key] = stripQuotes(line.slice(separator + 1));
  }
  return defines;
}

/** Collects `--dart-define=KEY=VALUE` overrides from flutter build args. */
function parseDartDefineArgs(args = []) {
  const defines = {};
  for (const arg of args) {
    const match = /^--dart-define=([^=]+)=(.*)$/su.exec(arg);
    if (match) defines[match[1]] = match[2];
  }
  return defines;
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Returns one message per define that would ship a cleartext, missing or
 * malformed backend URL. An empty result means the release is safe to build.
 */
function findInsecureDartDefines(defines) {
  const problems = [];
  for (const name of REQUIRED_URL_DEFINES) {
    const value = defines[name];
    if (!value) {
      problems.push(`${name} is missing; release builds require an https URL.`);
    } else if (!isHttpsUrl(value)) {
      problems.push(`${name} must be an https URL.`);
    }
  }
  for (const name of OPTIONAL_URL_DEFINES) {
    const value = defines[name];
    if (value && !isHttpsUrl(value)) {
      problems.push(`${name} must be an https URL when set.`);
    }
  }
  return problems;
}

function assertSecureDartDefines({ file, args = [] }) {
  const defines = {
    ...parseDartDefineFile(fs.readFileSync(file, 'utf8')),
    ...parseDartDefineArgs(args),
  };
  const problems = findInsecureDartDefines(defines);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to build a release with insecure dart-defines (${file}):\n- ${problems.join('\n- ')}`
    );
  }
}

if (require.main === module) {
  const [file, ...args] = process.argv.slice(2);
  try {
    if (!file) throw new Error('Usage: mobile-validate-dart-defines <file>');
    assertSecureDartDefines({ file, args });
    console.log(`Verified https backend URLs in ${file}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  assertSecureDartDefines,
  findInsecureDartDefines,
  parseDartDefineArgs,
  parseDartDefineFile,
};
