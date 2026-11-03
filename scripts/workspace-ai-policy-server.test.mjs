import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/server')
      return {
        shortCircuit: true,
        url: 'data:text/javascript,export const NextResponse = Response',
      };
    if (specifier === '@tuturuuu/supabase/next/server')
      return {
        shortCircuit: true,
        url: 'data:text/javascript,export const createAdminClient = async () => globalThis.policyFixtureDb',
      };
    if (specifier === './workspace-ai-policy')
      return {
        shortCircuit: true,
        url: pathToFileURL(
          `${import.meta.dirname}/../packages/utils/src/workspace-ai-policy.ts`
        ).href,
      };
    return next(specifier, context);
  },
});
const { workspaceAiPolicyResponse } = await import(
  '../packages/utils/src/workspace-ai-policy-server.ts'
);
function database({
  education = true,
  scope,
  enabled,
  error = false,
  membershipError = false,
  exists = true,
  duplicate = false,
  personal = true,
  otherEducation = false,
  roles = ['teacher'],
  permissions = roles.every((role) => ['teacher', 'staff'].includes(role))
    ? ['update_user_groups']
    : [],
  permissionError = false,
  educationOwner = false,
  roleError = false,
  roleOverflow = false,
  creator = 'fixture-user',
} = {}) {
  return {
    from(table) {
      const rows = [
        ['ENABLE_EDUCATION', String(education)],
        ['AI_EDUCATION_SCOPE', scope],
        ['AI_ENABLED', enabled],
      ]
        .filter(([, value]) => value !== undefined)
        .map(([name, value]) => ({ ws_id: 'fixture-workspace', name, value }));
      if (otherEducation)
        rows.push({
          ws_id: 'education-context',
          name: 'ENABLE_EDUCATION',
          value: 'true',
        });
      if (duplicate)
        rows.push({
          ws_id: 'fixture-workspace',
          name: 'AI_ENABLED',
          value: 'false',
        });
      const result =
        table === 'workspace_role_members'
          ? {
              data: roleOverflow
                ? Array(1000).fill({
                    workspace_roles: {
                      ws_id: 'education-context',
                      name: 'teacher',
                      workspace_role_permissions: [
                        {
                          ws_id: 'education-context',
                          permission: 'update_user_groups',
                          enabled: true,
                        },
                      ],
                    },
                  })
                : roles.map((name) => ({
                    workspace_roles: {
                      ws_id: 'education-context',
                      name,
                      workspace_role_permissions: permissionError
                        ? null
                        : permissions.map((permission) => ({
                            ws_id: 'education-context',
                            permission,
                            enabled: true,
                          })),
                    },
                  })),
              error: roleError || permissionError,
            }
          : table === 'workspace_members'
            ? {
                data: [
                  { ws_id: 'fixture-workspace' },
                  ...(otherEducation ? [{ ws_id: 'education-context' }] : []),
                ],
                error: membershipError,
              }
            : table === 'workspaces'
              ? {
                  data: exists
                    ? { id: 'fixture-workspace', personal, creator_id: creator }
                    : null,
                  error,
                }
              : { data: rows, error };
      const chain = Object.assign(Promise.resolve(result), {
        select: () => chain,
        eq: (key, value) => {
          if (
            table === 'workspaces' &&
            key === 'id' &&
            value !== 'fixture-workspace'
          ) {
            result.data = {
              id: value,
              personal: false,
              creator_id: educationOwner ? 'fixture-user' : 'someone-else',
            };
          }
          return chain;
        },
        in: () => chain,
        maybeSingle: async () => result,
      });
      return chain;
    },
  };
}
for (const config of [
  {},
  { scope: 'full' },
  { scope: 'learner-data-only' },
  { education: false, enabled: 'false' },
  { error: true },
  { membershipError: true },
  { exists: false },
  { education: false, enabled: null },
  { education: false, enabled: 'true', duplicate: true },
]) {
  test(`feature boundary refuses before downstream work ${JSON.stringify(config)}`, async () => {
    globalThis.policyFixtureDb = database(config);
    let providerCalls = 0;
    let creditCalls = 0;
    const refusal = await workspaceAiPolicyResponse(
      'fixture-workspace',
      'fixture-user',
      'vi'
    );
    if (!refusal) {
      creditCalls++;
      providerCalls++;
    }
    assert.equal(refusal.status, 403);
    assert.equal((await refusal.json()).code, 'WORKSPACE_AI_DISABLED');
    assert.equal(creditCalls, 0);
    assert.equal(providerCalls, 0);
  });
}
test('reviewed learner-data-only allows verified teacher-authored data', async () => {
  globalThis.policyFixtureDb = database({ scope: 'learner-data-only' });
  assert.equal(
    await workspaceAiPolicyResponse(
      'fixture-workspace',
      'fixture-user',
      'en',
      'teacher-authored'
    ),
    null
  );
});
test('existing ordinary workspace stays allowed', async () => {
  globalThis.policyFixtureDb = database({ education: false });
  assert.equal(
    await workspaceAiPolicyResponse('fixture-workspace', 'fixture-user'),
    null
  );
});

test('an unrelated business workspace preserves AI when its member also teaches in education', async () => {
  globalThis.policyFixtureDb = database({
    education: false,
    personal: false,
    otherEducation: true,
  });
  assert.equal(
    await workspaceAiPolicyResponse('fixture-workspace', 'fixture-user'),
    null
  );
});
test('personal billing retains education context', async () => {
  globalThis.policyFixtureDb = database({
    education: false,
    personal: true,
    otherEducation: true,
    roles: [],
  });
  assert.equal(
    (await workspaceAiPolicyResponse('fixture-workspace', 'fixture-user'))
      .status,
    403
  );
});

test('a missing chat context resolves the verified actor personal workspace', async () => {
  globalThis.policyFixtureDb = database({ education: false, personal: true });
  assert.equal(
    await workspaceAiPolicyResponse(undefined, 'fixture-user'),
    null
  );
});
test('a missing context without a verified actor fails closed', async () => {
  globalThis.policyFixtureDb = database({ education: false });
  assert.equal((await workspaceAiPolicyResponse(undefined)).status, 403);
});
test('learner-only features retain education context even with a business billing default', async () => {
  globalThis.policyFixtureDb = database({
    education: false,
    personal: false,
    otherEducation: true,
  });
  assert.equal(
    (
      await workspaceAiPolicyResponse(
        'fixture-workspace',
        'fixture-user',
        'en',
        'learner-data',
        true
      )
    ).status,
    403
  );
});

for (const [name, roles, roleError, expected] of [
  ['a teacher keeps personal AI', ['teacher'], false, true],
  ['staff keeps personal AI', ['staff'], false, true],
  ['a student is blocked', ['student'], false, false],
  ['a missing role is blocked', [], false, false],
  ['an unknown role is blocked', ['custom'], false, false],
  ['mixed role signals are blocked', ['teacher', 'student'], false, false],
  ['a role lookup error is blocked', ['teacher'], true, false],
]) {
  test(name, async () => {
    globalThis.policyFixtureDb = database({
      education: false,
      otherEducation: true,
      roles,
      roleError,
      permissions: roles.every((role) => ['teacher', 'staff'].includes(role))
        ? ['update_user_groups']
        : [],
    });
    assert.equal(
      (await workspaceAiPolicyResponse('fixture-workspace', 'fixture-user')) ===
        null,
      expected
    );
  });
}
test('a learner in one education workspace plus staff in another is blocked', async () => {
  const db = database({
    education: false,
    otherEducation: true,
    roles: ['student'],
  });
  const from = db.from.bind(db);
  db.from = (table) => {
    if (table !== 'workspace_role_members') return from(table);
    const chain = Object.assign(
      Promise.resolve({
        data: [
          { workspace_roles: { ws_id: 'education-context', name: 'student' } },
          { workspace_roles: { ws_id: 'another-education', name: 'staff' } },
        ],
        error: null,
      }),
      { select: () => chain, eq: () => chain, in: () => chain }
    );
    return chain;
  };
  globalThis.policyFixtureDb = db;
  assert.equal(
    (await workspaceAiPolicyResponse('fixture-workspace', 'fixture-user'))
      .status,
    403
  );
});
test('1000 role rows fail closed', async () => {
  globalThis.policyFixtureDb = database({
    education: false,
    otherEducation: true,
    roleOverflow: true,
  });
  assert.equal(
    (await workspaceAiPolicyResponse('fixture-workspace', 'fixture-user'))
      .status,
    403
  );
});

test('system personal-workspace AI resolves the workspace creator and blocks their learner context', async () => {
  globalThis.policyFixtureDb = database({
    education: false,
    otherEducation: true,
    roles: ['student'],
  });
  assert.equal(
    (await workspaceAiPolicyResponse('fixture-workspace')).status,
    403
  );
});
test('a personal workspace without a resolvable actor fails closed', async () => {
  globalThis.policyFixtureDb = database({ education: false, creator: null });
  assert.equal(
    (await workspaceAiPolicyResponse('fixture-workspace')).status,
    403
  );
});

for (const [name, config, allowed] of [
  [
    'custom teacher name without permission',
    { roles: ['teacher'], permissions: [] },
    false,
  ],
  [
    'student renamed staff without permission',
    { roles: ['staff'], permissions: [] },
    false,
  ],
  [
    'update_user_groups holder',
    { roles: ['custom'], permissions: ['update_user_groups'] },
    true,
  ],
  [
    'manage_workspace_roles holder',
    { roles: ['custom'], permissions: ['manage_workspace_roles'] },
    true,
  ],
  [
    'education workspace creator',
    { roles: [], permissions: [], educationOwner: true },
    true,
  ],
  [
    'permission lookup error',
    { roles: ['teacher'], permissionError: true },
    false,
  ],
]) {
  test(name, async () => {
    globalThis.policyFixtureDb = database({
      education: false,
      otherEducation: true,
      ...config,
    });
    assert.equal(
      (await workspaceAiPolicyResponse('fixture-workspace', 'fixture-user')) ===
        null,
      allowed
    );
  });
}
