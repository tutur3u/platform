const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(
  ROOT_DIR,
  'apps/tanstack-web/migration/route-manifest.json'
);
const OPENAPI_PATH = path.join(ROOT_DIR, 'apps/backend/api/openapi.yaml');
const BACKEND_ROUTE_KINDS = new Set(['api', 'cron', 'route-handler', 'trpc']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectOpenApiOperations(openApiSource) {
  const operations = new Map();
  let currentPath = null;

  for (const line of openApiSource.split(/\r?\n/u)) {
    const pathMatch = line.match(/^ {2}(\/[^:]+):\s*$/u);
    if (pathMatch) {
      currentPath = pathMatch[1];
      operations.set(currentPath, new Set());
      continue;
    }

    const methodMatch = line.match(
      /^ {4}(delete|get|head|options|patch|post|put):\s*$/u
    );
    if (methodMatch && currentPath) {
      operations.get(currentPath).add(methodMatch[1].toUpperCase());
    }
  }

  return operations;
}

function routePathToOpenApiPath(routePath) {
  return routePath
    .replace(/\/\*([A-Za-z0-9_]+)\??/gu, '/{$1}')
    .replace(/:([A-Za-z0-9_]+)/gu, '{$1}');
}

function rustOwnedMigratedRoutes(manifest) {
  return manifest.routes.filter(
    (route) =>
      BACKEND_ROUTE_KINDS.has(route.kind) &&
      route.status === 'migrated' &&
      route.targetOwner === 'rust-backend'
  );
}

test('migrated Rust-owned routes are documented in backend OpenAPI', () => {
  const manifest = readJson(MANIFEST_PATH);
  const operations = collectOpenApiOperations(
    fs.readFileSync(OPENAPI_PATH, 'utf8')
  );
  const missingOperations = [];

  for (const route of rustOwnedMigratedRoutes(manifest)) {
    const openApiPath = routePathToOpenApiPath(route.routePath);
    const documentedMethods = operations.get(openApiPath);

    for (const method of route.methods) {
      if (!documentedMethods?.has(method)) {
        missingOperations.push(`${method} ${openApiPath} (${route.id})`);
      }
    }
  }

  assert.deepEqual(
    missingOperations.sort(),
    [],
    'Every migrated Rust-owned route artifact needs a matching OpenAPI path and method.'
  );
});
