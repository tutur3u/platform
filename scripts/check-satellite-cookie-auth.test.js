const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  authorizesWithCookieClient,
  findViolations,
} = require('./check-satellite-cookie-auth.js');

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'satellite-cookie-auth-'));
}

function writeFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

const COOKIE_AUTH_ROUTE = `
  export async function GET() {
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase: supabase,
    });

    return Response.json(membership);
  }
`;

const APP_SESSION_ROUTE = `
  export async function GET() {
    const { supabase, user } = await resolveAuthenticatedSessionUser();

    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase: supabase,
    });

    return Response.json(membership);
  }
`;

const ADMIN_AUTH_ROUTE = `
  export async function GET() {
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase: sbAdmin,
    });

    return Response.json(membership);
  }
`;

test('recognizes membership checks made with the cookie client', () => {
  assert.equal(authorizesWithCookieClient(COOKIE_AUTH_ROUTE), true);
  assert.equal(authorizesWithCookieClient(APP_SESSION_ROUTE), false);
  assert.equal(authorizesWithCookieClient(ADMIN_AUTH_ROUTE), false);
});

test('flags a satellite route that authorizes with the cookie client', () => {
  const root = createTempRepo();
  writeFile(
    root,
    'apps/tasks/src/app/api/v1/thing/route.ts',
    COOKIE_AUTH_ROUTE
  );

  assert.deepEqual(findViolations(root), [
    path.join('apps', 'tasks', 'src', 'app', 'api', 'v1', 'thing', 'route.ts'),
  ]);
});

test('accepts the app-session and admin shapes', () => {
  const root = createTempRepo();
  writeFile(root, 'apps/tasks/src/app/api/v1/a/route.ts', APP_SESSION_ROUTE);
  writeFile(root, 'apps/tasks/src/app/api/v1/b/route.ts', ADMIN_AUTH_ROUTE);

  assert.deepEqual(findViolations(root), []);
});

test('leaves apps/web alone, since it owns the Supabase cookie session', () => {
  const root = createTempRepo();
  writeFile(root, 'apps/web/src/app/api/v1/thing/route.ts', COOKIE_AUTH_ROUTE);

  assert.deepEqual(findViolations(root), []);
});

test('the repository itself satisfies the rule', () => {
  assert.deepEqual(findViolations(), []);
});
