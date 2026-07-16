#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const MOBILE_API_CONFIG = 'apps/mobile/lib/core/config/api_config.dart';
const MOBILE_API_ORIGINS = 'apps/mobile/lib/core/config/api_origins.dart';
const MOBILE_API_CLIENT = 'apps/mobile/lib/data/sources/api_client.dart';
const CLI_SDK_DIRECTORY = 'packages/sdk/src';
const ROUTE_MANIFEST = 'apps/tanstack-web/migration/route-manifest.json';

function canonicalizeRoute(route) {
  return route
    .replace(/\[\[\.\.\.([^\]]+)\]\]/gu, ':*')
    .replace(/\[\.\.\.([^\]]+)\]/gu, ':*')
    .replace(/\[([^\]]+)\]/gu, ':*')
    .replace(/:[^/]+/gu, ':*')
    .replace(/\/$/u, '');
}

function normalizeClientPath(rawPath) {
  return rawPath
    .split('?')[0]
    .replace(/\$suffix/gu, '')
    .replace(/\$\{(?:suffix|build[^}]*)\}$/gu, '')
    .replace(/\$\{[^}]+\}/gu, ':*')
    .replace(/\$[A-Za-z][A-Za-z0-9_]*/gu, ':*')
    .replace(/\s+/gu, '');
}

function collectApiPaths(source) {
  return new Set(
    [...source.matchAll(/([`'"])(\/api\/[\s\S]*?)\1/gu)]
      .map((match) => normalizeClientPath(match[2]))
      .filter((route) => route.startsWith('/api/'))
  );
}

const collectMobileApiPaths = collectApiPaths;
const normalizeMobilePath = normalizeClientPath;

function walkSourceFiles(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkSourceFiles(entryPath, output);
    else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      output.push(entryPath);
    }
  }
  return output;
}

function collectCliSdkApiPaths({ rootDir = ROOT_DIR } = {}) {
  const paths = new Set();
  for (const filePath of walkSourceFiles(
    path.join(rootDir, CLI_SDK_DIRECTORY)
  )) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const route of collectApiPaths(source)) paths.add(route);
  }
  return paths;
}

function walkRouteFiles(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkRouteFiles(entryPath, output);
    else if (entry.name === 'route.ts') output.push(entryPath);
  }
  return output;
}

function routeFileToApiPath(filePath) {
  const normalized = filePath.split(path.sep).join('/');
  const markers = ['/src/app/api/', '/src/legacy-api-routes/'];
  for (const marker of markers) {
    const index = normalized.indexOf(marker);
    if (index >= 0) {
      return `/api/${normalized.slice(index + marker.length, -'/route.ts'.length)}`;
    }
  }
  return null;
}

function collectOwnedApiRoutes({ rootDir = ROOT_DIR } = {}) {
  const routes = new Set();
  const appsDir = path.join(rootDir, 'apps');

  for (const appName of fs.readdirSync(appsDir)) {
    for (const filePath of walkRouteFiles(
      path.join(appsDir, appName, 'src/app/api')
    )) {
      const route = routeFileToApiPath(filePath);
      if (route) routes.add(canonicalizeRoute(route));
    }
  }

  for (const filePath of walkRouteFiles(
    path.join(rootDir, 'apps/web/src/legacy-api-routes')
  )) {
    const route = routeFileToApiPath(filePath);
    if (route) routes.add(canonicalizeRoute(route));
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(rootDir, ROUTE_MANIFEST), 'utf8')
  );
  for (const route of manifest.routes ?? []) {
    if (route.kind === 'api') routes.add(canonicalizeRoute(route.routePath));
  }
  return routes;
}

function collectOwnedApiRoutesByApp({ rootDir = ROOT_DIR } = {}) {
  const routesByApp = new Map();
  const appsDir = path.join(rootDir, 'apps');

  for (const appName of fs.readdirSync(appsDir)) {
    const routes = new Set();
    for (const filePath of walkRouteFiles(
      path.join(appsDir, appName, 'src/app/api')
    )) {
      const route = routeFileToApiPath(filePath);
      if (route) routes.add(canonicalizeRoute(route));
    }
    if (routes.size > 0) routesByApp.set(appName, routes);
  }

  return routesByApp;
}

function collectConfiguredMobileApiApps(source) {
  return new Set(
    [...source.matchAll(/https:\/\/([a-z0-9-]+)\.tuturuuu\.com/gu)].map(
      (match) => match[1]
    )
  );
}

function findUnconfiguredSatelliteOwners({
  mobilePaths,
  routesByApp,
  configuredApps,
}) {
  const failures = [];
  for (const route of mobilePaths) {
    const canonicalRoute = canonicalizeRoute(route);
    const owners = [...routesByApp.entries()]
      .filter(([, routes]) => routes.has(canonicalRoute))
      .map(([appName]) => appName)
      .sort();

    if (
      owners.length > 0 &&
      !owners.includes('web') &&
      !owners.some((owner) => configuredApps.has(owner))
    ) {
      failures.push(`${route} => ${owners.join(', ')}`);
    }
  }
  return failures.sort();
}

function findSatelliteProxyBearerGaps({ configuredApps, proxySources }) {
  const failures = [];
  for (const appName of configuredApps) {
    const source = proxySources.get(appName);
    if (!source) {
      failures.push(`${appName}: missing src/proxy.ts`);
      continue;
    }

    if (
      !source.includes('hasAuthenticatedBearerToken') ||
      !/hasAuthenticatedBearerToken\([^)]*\.headers\)/u.test(source)
    ) {
      failures.push(
        `${appName}: proxy must pass bearer-authenticated mobile API requests to route auth`
      );
    }
  }
  return failures.sort();
}

function validateMobileOriginRouting({ rootDir = ROOT_DIR, mobilePaths }) {
  const originSource = fs.readFileSync(
    path.join(rootDir, MOBILE_API_ORIGINS),
    'utf8'
  );
  const clientSource = fs.readFileSync(
    path.join(rootDir, MOBILE_API_CLIENT),
    'utf8'
  );
  const routesByApp = collectOwnedApiRoutesByApp({ rootDir });
  const configuredApps = collectConfiguredMobileApiApps(originSource);
  const errors = findUnconfiguredSatelliteOwners({
    mobilePaths,
    routesByApp,
    configuredApps,
  });
  const proxySources = new Map(
    [...configuredApps].map((appName) => {
      const proxyPath = path.join(rootDir, 'apps', appName, 'src/proxy.ts');
      return [
        appName,
        fs.existsSync(proxyPath) ? fs.readFileSync(proxyPath, 'utf8') : null,
      ];
    })
  );
  errors.push(
    ...findSatelliteProxyBearerGaps({ configuredApps, proxySources })
  );

  if (!clientSource.includes('ApiConfig.baseUrlForPath(path)')) {
    errors.push(
      'ApiClient must resolve default requests through ApiConfig.baseUrlForPath(path).'
    );
  }
  return { configuredApps, errors, routesByApp };
}

function findUnmappedMobileApiPaths({ mobilePaths, ownedRoutes }) {
  return [...mobilePaths]
    .filter((route) => !ownedRoutes.has(canonicalizeRoute(route)))
    .sort();
}

function validateMobileApiMappings({ rootDir = ROOT_DIR } = {}) {
  const source = fs.readFileSync(path.join(rootDir, MOBILE_API_CONFIG), 'utf8');
  const mobilePaths = collectMobileApiPaths(source);
  const cliSdkPaths = collectCliSdkApiPaths({ rootDir });
  const ownedRoutes = collectOwnedApiRoutes({ rootDir });
  const originRouting = validateMobileOriginRouting({ rootDir, mobilePaths });
  return {
    mobilePaths,
    cliSdkPaths,
    ownedRoutes,
    unmapped: findUnmappedMobileApiPaths({ mobilePaths, ownedRoutes }),
    unmappedCliSdk: findUnmappedMobileApiPaths({
      mobilePaths: cliSdkPaths,
      ownedRoutes,
    }),
    originRouting,
    sharedClientPaths: new Set(
      [...mobilePaths].filter((route) => cliSdkPaths.has(route))
    ),
  };
}

function main() {
  const result = validateMobileApiMappings();
  if (result.mobilePaths.size < 100) {
    console.error(
      `Mobile API mapping check found only ${result.mobilePaths.size} paths; endpoint extraction likely regressed.`
    );
    process.exit(1);
  }
  if (result.unmapped.length > 0) {
    console.error(
      'Mobile API mapping check failed. No canonical owner was found for:'
    );
    for (const route of result.unmapped) console.error(`- ${route}`);
    console.error(
      'Update Flutter or register the route in a Next satellite, the Rust/TanStack manifest, or a legacy wrapper.'
    );
    process.exit(1);
  }
  if (result.unmappedCliSdk.length > 0) {
    console.error(
      'CLI SDK API mapping check failed. No canonical owner was found for:'
    );
    for (const route of result.unmappedCliSdk) console.error(`- ${route}`);
    console.error(
      'Update the CLI SDK client or register the migrated route in a canonical app or migration manifest.'
    );
    process.exit(1);
  }
  if (result.originRouting.errors.length > 0) {
    console.error('Mobile API origin routing check failed:');
    for (const error of result.originRouting.errors)
      console.error(`- ${error}`);
    console.error(
      'Add the satellite production origin and route policy before shipping a migrated API.'
    );
    process.exit(1);
  }
  console.log(
    `Client API mappings verified: ${result.mobilePaths.size} Flutter paths and ${result.cliSdkPaths.size} CLI SDK paths resolve to ${result.ownedRoutes.size} canonical API routes across ${result.originRouting.configuredApps.size} mobile satellite origins (${result.sharedClientPaths.size} exact overlaps).`
  );
}

if (require.main === module) main();

module.exports = {
  canonicalizeRoute,
  collectApiPaths,
  collectCliSdkApiPaths,
  collectMobileApiPaths,
  collectOwnedApiRoutes,
  collectOwnedApiRoutesByApp,
  collectConfiguredMobileApiApps,
  findUnmappedMobileApiPaths,
  findUnconfiguredSatelliteOwners,
  findSatelliteProxyBearerGaps,
  normalizeClientPath,
  normalizeMobilePath,
  routeFileToApiPath,
  validateMobileOriginRouting,
  validateMobileApiMappings,
};
