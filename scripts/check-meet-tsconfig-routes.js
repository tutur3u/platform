#!/usr/bin/env node

/**
 * apps/meet/tsconfig.app.json lists Meet's Next-style route handlers by
 * name. A route.ts missing from that list type-checks nowhere locally and
 * only fails in the Meet Cloudflare workflow (TS6307), so this guard makes
 * `bun check:changed` catch it before push.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const APP_DIR = 'apps/meet';
const TSCONFIG = 'tsconfig.app.json';

function parseJsonc(source) {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(stripped);
}

function listRouteFiles(dir, fsImpl = fs) {
  const found = [];
  const walk = (current) => {
    for (const entry of fsImpl.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') found.push(full);
    }
  };
  if (fsImpl.existsSync(dir)) walk(dir);
  return found;
}

/** Route files under src/app that the app tsconfig does not include. */
function findUnlistedMeetRoutes(rootDir = ROOT_DIR, fsImpl = fs) {
  const appRoot = path.join(rootDir, APP_DIR);
  const config = parseJsonc(
    fsImpl.readFileSync(path.join(appRoot, TSCONFIG), 'utf8')
  );
  const included = new Set(config.include ?? []);
  return listRouteFiles(path.join(appRoot, 'src/app'), fsImpl)
    .map((file) => path.relative(appRoot, file).split(path.sep).join('/'))
    .filter((file) => !included.has(file))
    .sort();
}

if (require.main === module) {
  const missing = findUnlistedMeetRoutes();
  if (missing.length) {
    console.error(
      `${APP_DIR}/${TSCONFIG} must list every Meet route handler. Add:\n${missing
        .map((file) => `  "${file}",`)
        .join('\n')}`
    );
    process.exit(1);
  }
  console.log('Meet route handlers are all listed in tsconfig.app.json');
}

module.exports = { findUnlistedMeetRoutes, parseJsonc };
