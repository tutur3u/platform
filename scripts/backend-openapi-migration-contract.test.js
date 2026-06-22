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
const BUFFERED_JSON_OPERATIONS = [
  ['PATCH', '/api/v1/users/me/profile'],
  ['POST', '/api/v1/inquiries'],
  ['POST', '/api/v1/infrastructure/languages'],
  ['POST', '/api/v1/infrastructure/sidebar'],
  ['POST', '/api/v1/infrastructure/sidebar/sizes'],
  ['POST', '/api/v1/internal/holidays'],
  ['POST', '/api/v1/internal/holidays/bulk'],
  ['PUT', '/api/v1/internal/holidays/{holidayId}'],
];

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

function collectOpenApiResponseRefs(openApiSource) {
  const responseRefs = new Map();
  let currentPath = null;
  let currentMethod = null;
  let currentStatus = null;
  let inResponses = false;

  for (const line of openApiSource.split(/\r?\n/u)) {
    const pathMatch = line.match(/^ {2}(\/[^:]+):\s*$/u);
    if (pathMatch) {
      currentPath = pathMatch[1];
      currentMethod = null;
      currentStatus = null;
      inResponses = false;
      continue;
    }

    const methodMatch = line.match(
      /^ {4}(delete|get|head|options|patch|post|put):\s*$/u
    );
    if (methodMatch && currentPath) {
      currentMethod = methodMatch[1].toUpperCase();
      currentStatus = null;
      inResponses = false;
      responseRefs.set(`${currentMethod} ${currentPath}`, new Map());
      continue;
    }

    if (!currentPath || !currentMethod) {
      continue;
    }

    if (line.match(/^ {6}responses:\s*$/u)) {
      inResponses = true;
      currentStatus = null;
      continue;
    }

    if (!inResponses) {
      continue;
    }

    const nextOperationFieldMatch = line.match(/^ {6}[A-Za-z][^:]*:\s*$/u);
    if (nextOperationFieldMatch) {
      inResponses = false;
      currentStatus = null;
      continue;
    }

    const statusMatch = line.match(/^ {8}"?([0-9]{3}|default)"?:\s*$/u);
    if (statusMatch) {
      currentStatus = statusMatch[1];
      continue;
    }

    const refMatch = line.match(/^ {10}\$ref:\s*"?([^"]+)"?\s*$/u);
    if (refMatch && currentStatus) {
      responseRefs
        .get(`${currentMethod} ${currentPath}`)
        .set(currentStatus, refMatch[1]);
    }
  }

  return responseRefs;
}

function collectOpenApiComponentKeys(openApiSource, sectionName) {
  const keys = new Set();
  let inComponents = false;
  let inSection = false;

  for (const line of openApiSource.split(/\r?\n/u)) {
    if (line.match(/^components:\s*$/u)) {
      inComponents = true;
      inSection = false;
      continue;
    }

    if (!inComponents) {
      continue;
    }

    const sectionMatch = line.match(/^ {2}([A-Za-z]+):\s*$/u);
    if (sectionMatch) {
      inSection = sectionMatch[1] === sectionName;
      continue;
    }

    if (!inSection) {
      continue;
    }

    const keyMatch = line.match(/^ {4}([A-Za-z0-9]+):\s*$/u);
    if (keyMatch) {
      keys.add(keyMatch[1]);
    }
  }

  return keys;
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

test('buffered JSON Rust routes document request body size guard responses', () => {
  const openApiSource = fs.readFileSync(OPENAPI_PATH, 'utf8');
  const responseRefs = collectOpenApiResponseRefs(openApiSource);
  const responseComponents = collectOpenApiComponentKeys(
    openApiSource,
    'responses'
  );
  const schemaComponents = collectOpenApiComponentKeys(
    openApiSource,
    'schemas'
  );
  const missingResponses = [];
  const missingComponents = [
    ['responses', 'RequestBodyLengthRequired', responseComponents],
    ['responses', 'RequestBodyTooLarge', responseComponents],
    ['schemas', 'RequestBodyLengthRequiredError', schemaComponents],
    ['schemas', 'RequestBodyTooLargeError', schemaComponents],
  ].flatMap(([section, name, keys]) =>
    keys.has(name) ? [] : [`components.${section}.${name}`]
  );

  for (const [method, openApiPath] of BUFFERED_JSON_OPERATIONS) {
    const key = `${method} ${openApiPath}`;
    const refs = responseRefs.get(key);

    if (
      refs?.get('411') !== '#/components/responses/RequestBodyLengthRequired'
    ) {
      missingResponses.push(`${key} 411`);
    }

    if (refs?.get('413') !== '#/components/responses/RequestBodyTooLarge') {
      missingResponses.push(`${key} 413`);
    }
  }

  assert.deepEqual(
    missingComponents.sort(),
    [],
    'Buffered body limit response components must stay reusable and documented.'
  );
  assert.deepEqual(
    missingResponses.sort(),
    [],
    'Buffered JSON Rust routes must document Content-Length-required and body-too-large responses.'
  );
});
