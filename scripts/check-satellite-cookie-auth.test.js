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

test('flags direct Supabase-session auth in satellite routes', () => {
  const source = `
    import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
    const supabase = await createClient(request);
    const { user } = await resolveAuthenticatedSessionUser(supabase);
  `;
  assert.equal(authorizesWithCookieClient(source), true);
});

test('flags Tasks routes that ignore the returned app-session client', () => {
  const source = `
    const supabase = await createClient(req);
    const { user } = await resolveAuthenticatedSessionUser(supabase);
    const { data } = await supabase.from('tasks').select('*');
  `;
  assert.equal(authorizesWithCookieClient(source), true);
  assert.equal(
    authorizesWithCookieClient(
      source.replace('{ user }', '{ user, supabase: sessionSupabase }')
    ),
    false
  );
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

test('flags cookie auth hidden in an API helper or shared library', () => {
  const root = createTempRepo();
  const source = `
    import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
    const supabase = await createClient(request);
    const { user } = await resolveAuthenticatedSessionUser(supabase);
  `;
  writeFile(root, 'apps/infrastructure/src/app/api/v1/thing/auth.ts', source);
  writeFile(root, 'apps/infrastructure/src/lib/thing/authorization.ts', source);

  assert.deepEqual(findViolations(root), [
    path.join(
      'apps',
      'infrastructure',
      'src',
      'app',
      'api',
      'v1',
      'thing',
      'auth.ts'
    ),
    path.join(
      'apps',
      'infrastructure',
      'src',
      'lib',
      'thing',
      'authorization.ts'
    ),
  ]);
});

test('flags a local resolver that discards its app-session client in helpers', () => {
  const root = createTempRepo();
  writeFile(
    root,
    'apps/tasks/src/lib/task-perm-helper.ts',
    `const supabase = await createClient();
     const { user } = await resolveAuthenticatedSessionUser(supabase);
     await supabase.from('tasks').select('*');`
  );
  writeFile(
    root,
    'apps/tasks/src/app/api/v1/task-plans/_utils.ts',
    `const supabase = (await createClient(request)) as TypedSupabaseClient;
     const { user } = await resolveAuthenticatedSessionUser(supabase);
     await verifyWorkspaceMembershipType({ wsId, userId: user.id, supabase });`
  );

  assert.deepEqual(findViolations(root), [
    path.join(
      'apps',
      'tasks',
      'src',
      'app',
      'api',
      'v1',
      'task-plans',
      '_utils.ts'
    ),
    path.join('apps', 'tasks', 'src', 'lib', 'task-perm-helper.ts'),
  ]);
});

test('flags Infrastructure routes that query directly with a cookie client', () => {
  const root = createTempRepo();
  writeFile(
    root,
    'apps/infrastructure/src/app/api/v1/thing/route.ts',
    "const supabase = await createClient(); await supabase.from('things').select('*');"
  );

  assert.deepEqual(findViolations(root), [
    path.join(
      'apps',
      'infrastructure',
      'src',
      'app',
      'api',
      'v1',
      'thing',
      'route.ts'
    ),
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
