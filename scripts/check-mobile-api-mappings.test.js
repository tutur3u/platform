const assert = require('node:assert/strict');
const test = require('node:test');

const {
  canonicalizeRoute,
  collectApiPaths,
  collectMobileApiPaths,
  findUnmappedMobileApiPaths,
  normalizeMobilePath,
  routeFileToApiPath,
  validateMobileApiMappings,
} = require('./check-mobile-api-mappings.js');

test('normalizes Dart interpolation and query suffixes', () => {
  assert.equal(
    normalizeMobilePath('/api/v1/workspaces/$wsId/users$suffix'),
    '/api/v1/workspaces/:*/users'
  );
  assert.equal(
    normalizeMobilePath('/api/v1/workspaces/$wsId/users?$' + '{Uri()}'),
    '/api/v1/workspaces/:*/users'
  );
});

test('extracts unique mobile API literals', () => {
  const paths = collectMobileApiPaths(`
    static String users(String wsId) => '/api/v1/workspaces/$wsId/users';
    static String usersAgain(String wsId) => '/api/v1/workspaces/$wsId/users';
    static const login = '/login';
  `);
  assert.deepEqual([...paths], ['/api/v1/workspaces/:*/users']);
});

test('normalizes CLI SDK templates and dynamic query builders', () => {
  const paths = collectApiPaths(`
    return \`/api/v1/workspaces/\${encodePathSegment(workspaceId)}/tasks\`;
    return \`/api/workspaces/\${encodePathSegment(workspaceId)}/transactions/export\${buildQuery(input)}\`;
  `);
  assert.deepEqual(
    [...paths],
    ['/api/v1/workspaces/:*/tasks', '/api/workspaces/:*/transactions/export']
  );
});

test('normalizes route files and parameter names', () => {
  assert.equal(
    routeFileToApiPath(
      '/repo/apps/contacts/src/app/api/v1/workspaces/[workspaceId]/users/route.ts'
    ),
    '/api/v1/workspaces/[workspaceId]/users'
  );
  assert.equal(
    canonicalizeRoute('/api/v1/workspaces/[workspaceId]/users/:userId'),
    '/api/v1/workspaces/:*/users/:*'
  );
});

test('reports only paths without a canonical API owner', () => {
  assert.deepEqual(
    findUnmappedMobileApiPaths({
      mobilePaths: new Set([
        '/api/v1/workspaces/:*/users',
        '/api/v1/workspaces/:*/missing',
      ]),
      ownedRoutes: new Set(['/api/v1/workspaces/:*/users']),
    }),
    ['/api/v1/workspaces/:*/missing']
  );
});

test('all checked-in mobile API paths have a canonical owner', () => {
  const result = validateMobileApiMappings();
  assert.ok(result.mobilePaths.size >= 100);
  assert.deepEqual(result.unmapped, []);
  assert.ok(result.cliSdkPaths.size >= 20);
  assert.deepEqual(result.unmappedCliSdk, []);
});
