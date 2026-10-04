#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { inventoryNextAppRoutes } = require('./tanstack-migration-manifest.js');
const {
  applyRouteOverrides,
  readRouteOverrides,
} = require('./tanstack-route-overrides.js');
const DEFAULT_ROOT = path.resolve(__dirname, '..');
const DIRECTORY = 'apps/tanstack-web/migration';
function createSatelliteBacklog(root = DEFAULT_ROOT) {
  const overrides = readRouteOverrides(
    path.join(root, DIRECTORY, 'satellite-route-overrides.json')
  );
  const apps = new Set(
    [...overrides.keys()].map((id) => {
      const app = id.match(/:apps\/([a-z][a-z0-9-]*)\/src\/app\//)?.[1];
      if (!app) throw new Error(`Invalid satellite source registration: ${id}`);
      return app;
    })
  );
  const routes = [...apps]
    .flatMap(
      (app) =>
        inventoryNextAppRoutes({
          appDir: path.join(root, 'apps', app, 'src/app'),
          rootDir: root,
          routeOverrides: new Map(),
        }).routes
    )
    .filter((route) => overrides.has(route.id));
  return {
    count: routes.length,
    contents: `${JSON.stringify(
      {
        generatedBy: 'scripts/tanstack-satellite-backlog.js',
        scope:
          'Registered satellite routes; the main Web manifest remains authoritative for live Web/Rust migration.',
        routes: applyRouteOverrides(routes, overrides).sort((a, b) =>
          a.id.localeCompare(b.id)
        ),
      },
      null,
      2
    )}\n`,
  };
}
function checkOrWriteSatelliteBacklog({
  root = DEFAULT_ROOT,
  check = false,
} = {}) {
  const { count, contents } = createSatelliteBacklog(root);
  const output = path.join(root, DIRECTORY, 'satellite-route-backlog.json');
  if (check)
    return (
      fs.existsSync(output) && fs.readFileSync(output, 'utf8') === contents
    );
  fs.writeFileSync(output, contents);
  console.log(`Registered ${count} satellite routes.`);
  return true;
}
if (require.main === module) {
  try {
    if (
      !checkOrWriteSatelliteBacklog({ check: process.argv.includes('--check') })
    ) {
      console.error(
        'Satellite route backlog is stale. Run node scripts/tanstack-satellite-backlog.js.'
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { createSatelliteBacklog, checkOrWriteSatelliteBacklog };
