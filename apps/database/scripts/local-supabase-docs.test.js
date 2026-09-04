import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const guide = readFileSync(
  path.join(
    repoRoot,
    'apps/docs/build/development-tools/local-supabase-development.mdx'
  ),
  'utf8'
);
const canonicalRlsGuide = readFileSync(
  path.join(repoRoot, 'apps/docs/reference/database/rls-policies.mdx'),
  'utf8'
);

function sqlForSection(source, heading) {
  const headingMatch = source.match(
    new RegExp(
      `^(#{2,6}) ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'm'
    )
  );
  assert.ok(headingMatch, `missing ${heading} section`);

  const start = headingMatch.index + headingMatch[0].length;
  const level = headingMatch[1].length;
  const remainder = source.slice(start);
  const nextHeading = remainder.match(new RegExp(`^#{2,${level}} `, 'm'));
  const section = remainder.slice(0, nextHeading?.index ?? remainder.length);

  return [...section.matchAll(/```sql\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .join('\n');
}

const organizationSql = sqlForSection(guide, 'Organization-based Access');
const roleSql = sqlForSection(guide, 'Role-based Access');
const triggerSql = sqlForSection(guide, 'Database Triggers');
const recipeSql = `${organizationSql}\n${roleSql}\n${triggerSql}`;

test('authorization recipes reject retired schema vocabulary', () => {
  const retiredSnippets = [
    'where workspace_id = table_name.workspace_id',
    "and role = 'admin'",
    'insert into public.workspaces (id, name, created_by)',
    'insert into public.workspace_members (workspace_id, user_id, role)',
    'where created_by = new.id',
  ];

  for (const snippet of retiredSnippets) {
    assert.ok(!recipeSql.includes(snippet), `retired SQL returned: ${snippet}`);
  }
});

test('RLS recipes use current workspace columns, membership type, and permission helper', () => {
  assert.match(organizationSql, /workspace_member\.ws_id = table_name\.ws_id/);
  assert.match(organizationSql, /workspace_member\.type = 'MEMBER'/);
  assert.match(organizationSql, /\(select auth\.uid\(\)\)/);
  assert.match(roleSql, /public\.has_workspace_permission\(/);
  assert.match(roleSql, /table_name\.ws_id/);
  assert.match(roleSql, /'manage_projects'/);
});

test('privileged recipe documents a hardened caller boundary', () => {
  assert.match(recipeSql, /security definer/i);
  assert.match(recipeSql, /set search_path = ''/i);
  assert.match(recipeSql, /v_caller_id is null/i);
  assert.match(recipeSql, /auth\.jwt\(\).*service_role/is);
  assert.match(recipeSql, /revoke execute on function/i);
  assert.match(guide, /grant\s+matrix and allowed\/denied calls\s+with pgTAP/i);
});

test('personal workspace trigger uses current columns without re-querying', () => {
  assert.match(triggerSql, /v_workspace_id uuid := gen_random_uuid\(\)/i);
  assert.match(
    triggerSql,
    /insert into public\.workspaces \(id, name, personal, creator_id\)/i
  );
  assert.match(
    triggerSql,
    /insert into public\.workspace_members \(ws_id, user_id, type\)/i
  );
  assert.match(triggerSql, /values \(v_workspace_id, new\.id, 'MEMBER'\)/i);
  assert.match(triggerSql, /set search_path = ''/i);
  assert.match(triggerSql, /revoke execute on function/i);
});

test('database test command invokes the wrapper directly', () => {
  assert.match(
    guide,
    /bun --cwd apps\/database scripts\/run-supabase\.js test db/
  );
  assert.doesNotMatch(
    guide,
    /bun --cwd apps\/database run scripts\/run-supabase\.js test db/
  );
});

test('canonical RLS guide does not contradict current membership schema', () => {
  assert.doesNotMatch(canonicalRlsGuide, /wrp\.role_id = wm\.role/);
  assert.match(
    canonicalRlsGuide,
    /workspace_members wm[\s\S]*wm\.type = 'MEMBER'/
  );
  assert.match(canonicalRlsGuide, /set search_path = ''/i);
});
