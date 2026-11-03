import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const moduleUrl = (path) => new URL(path, root).href;
const stub = (source) => ({
  shortCircuit: true,
  url: `data:text/javascript,${encodeURIComponent(source)}`,
});
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/server')
      return stub(
        'export const NextResponse = Response; export const connection = async () => {}'
      );
    if (specifier === 'zod')
      return stub(
        'const str = {trim:()=>str,min:()=>str,max:()=>str,optional:()=>str}; const schema={safeParse:data=>({success:true,data}),refine:()=>schema}; export const z={string:()=>str,object:()=>schema};'
      );
    if (specifier === '@/lib/infrastructure-admin-access')
      return stub(
        'export const authorizeInfrastructureWorkspaceSecretsRequest = async () => ({ok:true,user:{id:"actor"},sbAdmin:globalThis.secretDb})'
      );
    if (specifier === '@/lib/managed-cron-secret')
      return {
        shortCircuit: true,
        url: moduleUrl('apps/infrastructure/src/lib/managed-cron-secret.ts'),
      };
    if (specifier === '@tuturuuu/utils/constants')
      return stub('export const ROOT_WORKSPACE_ID = "fixture-root"');
    if (specifier === '@tuturuuu/utils/workspace-helper')
      return stub(
        'export const getPermissions = async () => ({containsPermission: () => globalThis.rootStaffPermission === true})'
      );
    if (specifier === 'server-only') return stub('');
    if (specifier === '@tuturuuu/supabase/next/user')
      return stub(
        'export const getVerifiedAuthUser = async () => globalThis.secretActor'
      );
    if (specifier === '@tuturuuu/supabase/next/auth-session-user')
      return stub(
        'export const resolveAuthenticatedSessionUser = async () => ({user:{id:"actor"}})'
      );
    if (specifier === '@tuturuuu/supabase/next/server')
      return stub(
        'export const createClient = async () => ({}); export const createAdminClient = async () => globalThis.secretDb'
      );
    if (specifier === './client' && context.parentURL.includes('staff-session'))
      return stub('export const isValidTuturuuuEmail = () => false');
    if (specifier === '@tuturuuu/utils/email/staff-session')
      return {
        shortCircuit: true,
        url: moduleUrl('packages/utils/src/email/staff-session.ts'),
      };
    if (specifier === '@/lib/workspace-secrets/managed-cron')
      return {
        shortCircuit: true,
        url: moduleUrl('apps/web/src/lib/workspace-secrets/managed-cron.ts'),
      };
    if (specifier === './access' || specifier === '../access')
      return stub(
        'export const getWorkspaceSecretsAccess = async () => ({allowed:true, db:globalThis.secretDb,resolvedWsId:"fixture-workspace"})'
      );
    if (specifier === './schema' || specifier === '../schema')
      return stub(
        'export const workspaceSecretWriteSchema = {safeParse: data => ({success:true,data})}'
      );
    return next(specifier, context);
  },
});
const { POST } = await import(
  '../apps/web/src/legacy-api-routes/workspaces/[wsId]/secrets/route.ts'
);
const { PUT, DELETE } = await import(
  '../apps/web/src/legacy-api-routes/workspaces/[wsId]/secrets/[secretId]/route.ts'
);
const infraPost = await import(
  '../apps/infrastructure/src/app/api/workspaces/[wsId]/secrets/route.ts'
);
const infraItem = await import(
  '../apps/infrastructure/src/app/api/workspaces/[wsId]/secrets/[secretId]/route.ts'
);
for (const [api, post, put, remove] of [
  ['secrets UI', POST, PUT, DELETE],
  ['infrastructure', infraPost.POST, infraItem.PUT, infraItem.DELETE],
])
  for (const role of ['admin', 'owner'])
    for (const name of [
      'AI_ENABLED',
      'AI_EDUCATION_SCOPE',
      'ENABLE_EDUCATION',
    ]) {
      for (const action of [
        'set',
        'rename-in',
        'rename-out',
        'clear',
        'delete',
      ]) {
        test(`${api} API: non-staff ${role} cannot ${action} ${name}`, async () => {
          globalThis.secretActor = {
            email: 'admin@example.test',
            email_confirmed_at: '2026-01-01',
            identities: [{ provider: 'email' }],
          };
          let writes = 0;
          const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({
              data: { name: action === 'rename-in' ? 'ordinary' : name },
              error: null,
            }),
            insert: () => {
              writes++;
              return chain;
            },
            update: () => {
              writes++;
              return chain;
            },
            delete: () => {
              writes++;
              return chain;
            },
          };
          globalThis.secretDb = { from: () => chain };
          const handler =
            action === 'set' ? post : action === 'delete' ? remove : put;
          const response = await handler(
            new Request('https://example.test/secrets', {
              method: 'POST',
              body: JSON.stringify({
                name: action === 'rename-out' ? 'ordinary' : name,
                value: action === 'clear' ? '' : 'false',
              }),
            }),
            {
              params: Promise.resolve({
                wsId: 'fixture-workspace',
                secretId: 'fixture-secret',
              }),
            }
          );
          assert.equal(response.status, 403);
          assert.equal(writes, 0);
        });
      }
    }

test('a verified employee without root-workspace authority cannot set AI policy', async () => {
  globalThis.secretActor = {
    email: 'employee@tuturuuu.com',
    email_confirmed_at: '2026-01-01',
    identities: [{ provider: 'email' }],
  };
  globalThis.rootStaffPermission = false;
  let writes = 0;
  globalThis.secretDb = {
    from: () => ({
      insert: async () => {
        writes++;
        return { error: null };
      },
    }),
  };
  const response = await POST(
    new Request('https://example.test/secrets', {
      method: 'POST',
      body: JSON.stringify({ name: 'AI_ENABLED', value: 'false' }),
    }),
    { params: Promise.resolve({ wsId: 'fixture-workspace' }) }
  );
  assert.equal(response.status, 403);
  assert.equal(writes, 0);
});

for (const name of ['AI_ENABLED', 'AI_EDUCATION_SCOPE', 'ENABLE_EDUCATION']) {
  test(`verified staff with root authority can set ${name}`, async () => {
    globalThis.secretActor = {
      email: 'employee@tuturuuu.com',
      email_confirmed_at: '2026-01-01',
      identities: [{ provider: 'email' }],
    };
    globalThis.rootStaffPermission = true;
    let writes = 0;
    globalThis.secretDb = {
      from: () => ({
        insert: async () => {
          writes++;
          return { error: null };
        },
      }),
    };
    const response = await POST(
      new Request('https://example.test/secrets', {
        method: 'POST',
        body: JSON.stringify({ name, value: 'false' }),
      }),
      { params: Promise.resolve({ wsId: 'fixture-workspace' }) }
    );
    assert.equal(response.status, 200);
    assert.equal(writes, 1);
  });
}
