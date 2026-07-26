#!/usr/bin/env node

/**
 * Satellite cookie-auth check.
 *
 * A session on a satellite app is normally a Tuturuuu app-session JWT, not a
 * Supabase auth cookie. `createClient()` (the cookie-backed client) is therefore
 * *anonymous* there, so any RLS-scoped authorization query made through it comes
 * back empty and the route denies a request it should have allowed.
 *
 * That failure is silent — a 403 or a "not found" that looks like missing data —
 * and it has shipped twice: workspace member invites from every satellite, and
 * every cross-workspace task deep link.
 *
 * Rule: in a satellite app, do not hand the `createClient()` client to
 * `verifyWorkspaceMembershipType`. Resolve the actor with the app-session-aware
 * helper and authorize with the client it returns (or an admin client filtered by
 * the authenticated user id).
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const APPS_DIR_RELATIVE_PATH = 'apps';
// `apps/web` owns the Supabase cookie session, so the cookie client is a valid
// actor source there.
const COOKIE_SESSION_OWNER_APPS = new Set(['web']);
// Only a `const` binding is a violation: routes that start from the cookie
// client and then reassign `supabase` to an app-session client (`let supabase =
// await createClient()` … `supabase = auth.supabase`) are already correct.
const COOKIE_CLIENT_PATTERN = /\bconst supabase = await createClient\(\s*\)/u;
const MEMBERSHIP_CALL_PATTERN =
  /verifyWorkspaceMembershipType\(\s*\{[^}]*?supabase:\s*supabase\b/su;

function listDirectories(directory) {
  try {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function collectRouteFiles(directory) {
  let entries;

  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      files.push(...collectRouteFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name === 'route.ts') {
      files.push(fullPath);
    }
  }

  return files;
}

/** True when the file authorizes membership with the cookie-backed client. */
function authorizesWithCookieClient(source) {
  return (
    COOKIE_CLIENT_PATTERN.test(source) && MEMBERSHIP_CALL_PATTERN.test(source)
  );
}

function findViolations(root = REPO_ROOT) {
  const appsDir = path.join(root, APPS_DIR_RELATIVE_PATH);
  const violations = [];

  for (const appName of listDirectories(appsDir)) {
    if (COOKIE_SESSION_OWNER_APPS.has(appName)) continue;

    const apiDir = path.join(appsDir, appName, 'src', 'app', 'api');

    for (const filePath of collectRouteFiles(apiDir)) {
      if (!authorizesWithCookieClient(fs.readFileSync(filePath, 'utf8'))) {
        continue;
      }

      violations.push(path.relative(root, filePath));
    }
  }

  return violations.sort((left, right) => left.localeCompare(right));
}

function run() {
  const violations = findViolations(REPO_ROOT);

  if (violations.length === 0) {
    process.stdout.write('Satellite cookie-auth check passed.\n');
    return;
  }

  const lines = [
    'Satellite cookie-auth check failed.',
    'These satellite routes authorize with the cookie-backed Supabase client,',
    'which is anonymous when the session is an app-session JWT — so the',
    'membership lookup silently fails and the route denies valid callers:',
    ...violations.map((filePath) => ` - ${filePath}`),
    '',
    'Resolve the actor with the app-session-aware helper and authorize with the',
    'client it returns, or with an admin client filtered by the authenticated',
    'user id.',
  ];

  process.stderr.write(`${lines.join('\n')}\n`);
  process.exitCode = 1;
}

if (require.main === module) {
  run();
}

module.exports = {
  authorizesWithCookieClient,
  findViolations,
};
