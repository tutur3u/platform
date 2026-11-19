const assert = require('node:assert/strict');
const test = require('node:test');
const { missingPermissionHelper } = require('./security-route-permissions');
test('flags a route with no permission helper', () => {
  assert.equal(
    missingPermissionHelper(
      'export async function GET() { return Response.json({}); }'
    ),
    true
  );
});
test('accepts supported permission helpers at call sites', () => {
  for (const helper of [
    'getPermissions',
    'withSessionAuth',
    'withWorkspaceAuth',
    'requireWorkspacePermission',
  ]) {
    assert.equal(
      missingPermissionHelper(`export const GET = ${helper}({});`),
      false
    );
  }
});
test('accepts a supported helper called with a type argument', () => {
  assert.equal(
    missingPermissionHelper('export const GET = withSessionAuth<Params>(fn);'),
    false
  );
  assert.equal(
    missingPermissionHelper(
      'export const GET = withSessionAuth<{ wsId: string }>(fn);'
    ),
    false
  );
});

test('a generic reference without a call cannot hide an unguarded route', () => {
  for (const source of [
    'const handler = withSessionAuth<Params>;',
    'const handler = unrelated<Params>(fn);',
    'const text = "withSessionAuth<Params>(fn)";',
    '// withSessionAuth<Params>(fn)',
  ]) {
    assert.equal(missingPermissionHelper(source), true);
  }
});

test('comments, strings and bare imports cannot hide an unguarded route', () => {
  for (const prefix of [
    '// getPermissions({});\n',
    '/* withSessionAuth({}) */\n',
    'const text = "getPermissions({})";\n',
    'import { getPermissions } from "helper";\n',
  ]) {
    assert.equal(
      missingPermissionHelper(`${prefix}export async function GET() {}`),
      true
    );
  }
});

test('inventory exceptions cannot hide a changed or moved route', () => {
  const { newFindings } = require('./security-route-permissions');
  const original = {
    file: 'apps/web/src/app/api/a/route.ts',
    digest: 'before',
  };
  assert.deepEqual(newFindings([original], [original]), []);
  assert.equal(
    newFindings([{ ...original, digest: 'after' }], [original]).length,
    1
  );
  assert.equal(
    newFindings(
      [{ ...original, file: 'apps/web/src/app/api/b/route.ts' }],
      [original]
    ).length,
    1
  );
});
