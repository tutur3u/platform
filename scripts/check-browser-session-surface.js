#!/usr/bin/env node

/**
 * Browser session-surface guard (shared-session plan, decision b).
 *
 * The shared session must end up unreadable by page script. This guard keeps
 * the surfaces that can expose it from growing while they are migrated:
 *
 * - browserSupabaseClientImports: imports or requires of the browser Supabase
 *   clients (`@tuturuuu/supabase/next/client`, `next/auth-browser`),
 *   `createBrowserClient` from `@supabase/ssr`, and `@supabase/supabase-js`
 *   `createClient` in a `'use client'` module.
 * - postgresChangesSubscriptions: `postgres_changes` realtime subscriptions,
 *   which need a JS-held session.
 * - sessionCookieScriptAccess: `document.cookie` in a file that names a
 *   session cookie.
 * - sessionTokenResponses: an access/refresh-token key (plain, quoted or
 *   shorthand) in a file that builds JSON responses, `{ body: ... }` route
 *   results or `new Response(JSON.stringify(...))`, or a `.json(session)` dump. Each entry records why the token may leave the
 *   server (native or CLI bearer, provider OAuth storage, ...).
 *
 * The allowlist is shrink-only: a new match fails, and an entry whose file no
 * longer matches also fails until it is removed.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(
  __dirname,
  'browser-session-surface-allowlist.json'
);
const PAUSED_APPS = new Set(['backend', 'tanstack-web']);
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/u;
const EXCLUDED_FILE = /(?:\.test\.|\.spec\.|\.stories\.|\.d\.ts$)/u;
const EXCLUDED_DIRECTORIES = new Set([
  '__tests__',
  '__mocks__',
  'node_modules',
  '.next',
  'dist',
  'generated',
]);

const BROWSER_CLIENT_MODULE =
  '[\'"]@tuturuuu/supabase/next/(?:client|auth-browser)[\'"]';
const TOKEN_FIELD = '(?:refresh_token|refreshToken|access_token|accessToken)';
const USE_CLIENT_DIRECTIVE = /^\s*['"]use client['"]/mu;

const RULES = {
  browserSupabaseClientImports: (source) =>
    new RegExp(`from\\s+${BROWSER_CLIENT_MODULE}`, 'u').test(source) ||
    new RegExp(
      `(?:import|require)\\(\\s*${BROWSER_CLIENT_MODULE}\\s*\\)`,
      'u'
    ).test(source) ||
    /import\s*\{[^}]*\bcreateBrowserClient\b[^}]*\}\s*from\s*['"]@supabase\/ssr['"]/u.test(
      source
    ) ||
    (USE_CLIENT_DIRECTIVE.test(source) &&
      /from\s*['"]@supabase\/supabase-js['"]/u.test(source) &&
      /\bcreateClient\s*\(/u.test(source)),
  postgresChangesSubscriptions: (source) =>
    /['"]postgres_changes['"]/u.test(source),
  sessionCookieScriptAccess: (source) =>
    source.includes('document.cookie') &&
    /\bsb-|auth-token|app_session/u.test(source),
  sessionTokenResponses: (source) => {
    const tokenKey =
      new RegExp(`['"]?\\b${TOKEN_FIELD}\\b['"]?\\s*:`, 'u').test(source) ||
      new RegExp(`[{,]\\s*${TOKEN_FIELD}\\s*(?=[,}])`, 'u').test(source);
    const response =
      /(?:\.json\s*\(|jsonWithCors\s*\(|\bbody\s*:\s*\{|new\s+Response\s*\(\s*JSON\.stringify\s*\()/u.test(
        source
      );
    const sessionDump = /\.json\s*\(\s*(?:data\.)?session\s*[,)]/u.test(source);
    return (tokenKey && response) || sessionDump;
  },
};

function listSourceFiles(directory, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        listSourceFiles(path.join(directory, entry.name), files);
      }
    } else if (
      SOURCE_EXTENSIONS.test(entry.name) &&
      !EXCLUDED_FILE.test(entry.name)
    ) {
      files.push(path.join(directory, entry.name));
    }
  }

  return files;
}

function listScannedFiles(repoRoot = REPO_ROOT) {
  const roots = [];
  for (const group of ['apps', 'packages']) {
    const groupDir = path.join(repoRoot, group);
    let names = [];
    try {
      names = fs.readdirSync(groupDir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (group === 'apps' && PAUSED_APPS.has(name)) continue;
      roots.push(path.join(groupDir, name, 'src'));
    }
  }

  return roots
    .flatMap((root) => listSourceFiles(root))
    .map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))
    .sort();
}

function collectMatches(files, readFile) {
  const matches = Object.fromEntries(
    Object.keys(RULES).map((rule) => [rule, []])
  );

  for (const file of files) {
    const source = readFile(file);
    for (const [rule, test] of Object.entries(RULES)) {
      if (test(source)) matches[rule].push(file);
    }
  }

  return matches;
}

function allowlistFiles(entries) {
  return entries.map((entry) =>
    typeof entry === 'string' ? entry : entry.file
  );
}

function compareWithAllowlist(matches, allowlist) {
  const problems = [];

  for (const rule of Object.keys(RULES)) {
    const allowed = new Set(allowlistFiles(allowlist[rule] ?? []));
    const found = new Set(matches[rule]);

    for (const file of found) {
      if (!allowed.has(file)) problems.push({ file, kind: 'new', rule });
    }
    for (const file of allowed) {
      if (!found.has(file)) problems.push({ file, kind: 'stale', rule });
    }
    for (const entry of allowlist[rule] ?? []) {
      if (rule === 'sessionTokenResponses' && !entry.reason) {
        problems.push({ file: entry.file ?? entry, kind: 'no-reason', rule });
      }
    }
  }

  return problems;
}

function formatProblem({ file, kind, rule }) {
  if (kind === 'new') {
    return `  ${rule}: ${file} adds a browser session surface. Use a same-origin API through @tuturuuu/internal-api instead, or (for a deliberate token response) add it to scripts/browser-session-surface-allowlist.json with a reason and security review.`;
  }
  if (kind === 'stale') {
    return `  ${rule}: ${file} no longer matches. Remove it from scripts/browser-session-surface-allowlist.json (the list only shrinks).`;
  }
  return `  ${rule}: ${file} needs a reason in the allowlist.`;
}

function main() {
  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const files = listScannedFiles();
  const matches = collectMatches(files, (file) =>
    fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')
  );
  const problems = compareWithAllowlist(matches, allowlist);

  if (problems.length > 0) {
    console.error('Browser session-surface guard failed:');
    for (const problem of problems) console.error(formatProblem(problem));
    process.exit(1);
  }

  const counts = Object.entries(matches)
    .map(([rule, found]) => `${rule}=${found.length}`)
    .join(', ');
  console.log(`Browser session surface within allowlist (${counts})`);
}

if (require.main === module) {
  main();
}

module.exports = {
  RULES,
  collectMatches,
  compareWithAllowlist,
  listScannedFiles,
};
