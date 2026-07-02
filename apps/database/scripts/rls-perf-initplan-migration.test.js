import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260701070408_wrap_rls_perf_initplan.sql',
  import.meta.url
);

const migrationSql = fs.readFileSync(migrationPath, 'utf8');

const normalizeSql = (sql) => sql.replace(/\s+/g, ' ').trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const extractPolicy = (tableName, policyName) => {
  const pattern = new RegExp(
    `ALTER POLICY "${escapeRegex(policyName)}" ON ${escapeRegex(tableName)}\\s+([\\s\\S]*?);`,
    'u'
  );
  const match = migrationSql.match(pattern);

  assert.ok(match, `Expected to find policy "${policyName}" on ${tableName}`);

  return match[1];
};

test('RLS initplan migration keeps auth helpers wrapped in scalar selects', () => {
  const unwrappedCalls = [
    ...migrationSql.matchAll(/\bauth\.(uid|role|email)\(\)/giu),
  ]
    .filter((match) => {
      const prefix = migrationSql.slice(
        Math.max(0, match.index - 16),
        match.index
      );
      return !/\(\s*select\s*$/iu.test(prefix);
    })
    .map((match) => `${match[0]} at offset ${match.index}`);

  assert.deepEqual(unwrappedCalls, []);
  assert.doesNotMatch(
    migrationSql,
    /\(\s*select\s+\(\s*select\s+auth\.(uid|role|email)\(\)\s*\)\s*\)/iu
  );
});

test('RLS initplan migration keeps workspace member first-seat check correlated', () => {
  const policy = extractPolicy(
    'public.workspace_members',
    'Allow workspace managers to insert members with constraints'
  );

  assert.doesNotMatch(policy, /\bwm\.ws_id\s*=\s*wm\.ws_id\b/u);
  assert.match(policy, /\bwm\.ws_id\s*=\s*workspace_members\.ws_id\b/u);
});

test('RLS initplan migration keeps workspace creator guard outside insert branches', () => {
  const policy = normalizeSql(
    extractPolicy(
      'public.workspaces',
      'Enable insert for authenticated users only'
    )
  );

  assert.equal(
    policy,
    normalizeSql(`
      WITH CHECK (
        (creator_id = (select auth.uid()))
        AND (
          is_tuturuuu_email(( SELECT user_private_details.email FROM user_private_details WHERE (user_private_details.user_id = (select auth.uid()))))
          OR (count_user_workspaces((select auth.uid())) < 10)
        )
      )
    `)
  );
});

test('RLS initplan migration scope stays limited to auth helper policy rewrites', () => {
  const policyRewriteCount =
    migrationSql.match(/^ALTER POLICY/gmu)?.length ?? 0;

  assert.equal(policyRewriteCount, 349);
  assert.doesNotMatch(migrationSql, /current_setting/iu);
});
