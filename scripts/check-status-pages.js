#!/usr/bin/env node

/**
 * Every user-facing app renders unknown paths and uncaught errors with the
 * shared Tuturuuu status page (`@tuturuuu/ui/custom/status-page`), in both
 * runtimes: the TanStack Start root route and the Next App Router files.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Apps with no Tuturuuu-branded not-found surface, and why. */
const EXEMPT = {
  colab: 'Vite SPA routed by query string; every path renders the app',
  'workspace-domains': 'customer custom domains stay unbranded',
  mobile: 'Flutter app',
  docs: 'Mintlify site',
  'tanstack-web': 'retired runtime',
};

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Problems for one app directory; `null` when it serves no pages. */
function appProblems(appDir) {
  const problems = [];
  const at = (rel) => read(path.join(appDir, rel));
  const root = at('src/routes/__root.tsx');
  const shell = at('src/runtime/router-shell.tsx') ?? '';
  const nextLocale = at('src/app/[locale]/layout.tsx');
  const nextRoot = at('src/app/layout.tsx');
  if (root === null && nextLocale === null && nextRoot === null) return null;

  if (root !== null) {
    const source = `${root}\n${shell}`;
    const bridged =
      /createBridgeRootRoute\(|createBridgeStatusComponents\(/.test(root);
    if (/<h1>\s*404\s*<\/h1>/.test(source)) problems.push('bare 404 heading');
    if (!bridged) {
      if (!/notFoundComponent:/.test(root)) problems.push('root notFound');
      if (!/errorComponent:/.test(root)) problems.push('root error');
      if (!/StatusPage|LinkStatusPage/.test(source))
        problems.push('root not-found uses StatusPage');
      if (!/StatusPage|AppErrorBoundary/.test(source))
        problems.push('root error uses the shared page');
    }
  }
  const nextDir = nextLocale !== null ? 'src/app/[locale]' : 'src/app';
  if (nextLocale !== null || nextRoot !== null) {
    if (!/StatusPage/.test(at(`${nextDir}/not-found.tsx`) ?? ''))
      problems.push(`${nextDir}/not-found.tsx uses StatusPage`);
    if (
      !/AppErrorBoundary[\s\S]*chrome="page"/.test(
        at(`${nextDir}/error.tsx`) ?? ''
      )
    )
      problems.push(`${nextDir}/error.tsx uses AppErrorBoundary chrome="page"`);
    if (!/GlobalAppErrorBoundary/.test(at('src/app/global-error.tsx') ?? ''))
      problems.push('src/app/global-error.tsx uses GlobalAppErrorBoundary');
  }
  return problems;
}

function bridgeProblems(rootDir) {
  const route = read(
    path.join(rootDir, 'packages/start-bridge/src/start/page-route.tsx')
  );
  const status = read(
    path.join(rootDir, 'packages/start-bridge/src/start/status-route.tsx')
  );
  const problems = [];
  if (!/notFoundComponent: BridgeNotFound/.test(route ?? ''))
    problems.push('bridge notFound');
  if (!/errorComponent: BridgeError/.test(route ?? ''))
    problems.push('bridge error');
  if (!/StatusPage/.test(status ?? '')) problems.push('bridge uses StatusPage');
  return problems;
}

function statusPageCoverage(rootDir = path.resolve(__dirname, '..')) {
  const appsDir = path.join(rootDir, 'apps');
  const rows = [];
  for (const name of fs.readdirSync(appsDir).sort()) {
    if (EXEMPT[name]) continue;
    const problems = appProblems(path.join(appsDir, name));
    if (problems) rows.push({ app: name, problems });
  }
  rows.push({
    app: 'packages/start-bridge',
    problems: bridgeProblems(rootDir),
  });
  return rows;
}

module.exports = { appProblems, bridgeProblems, EXEMPT, statusPageCoverage };

if (require.main === module) {
  const rows = statusPageCoverage();
  const failing = rows.filter((row) => row.problems.length > 0);
  for (const row of rows)
    console.log(
      `${row.problems.length ? 'FAIL' : 'ok  '} ${row.app}${row.problems.length ? `: ${row.problems.join('; ')}` : ''}`
    );
  for (const [app, reason] of Object.entries(EXEMPT))
    console.log(`skip ${app}: ${reason}`);
  process.exit(failing.length > 0 ? 1 : 0);
}
