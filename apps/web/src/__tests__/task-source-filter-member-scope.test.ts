import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd().endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd();

const migrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260602191427_harden_task_source_filter_member_scope.sql'
);

describe('task source filter member-scope migration', () => {
  it('requires MEMBER access for the route workspace and external sources', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain(
      'create or replace function private.list_task_source_filter_ids'
    );
    expect(source).toContain('security definer');
    expect(source).toContain('set search_path = public');

    const targetMembership = source.match(
      /target_membership as \([\s\S]*?limit 1\s*\)/u
    )?.[0];
    expect(targetMembership).toContain('wm.ws_id = p_workspace_id');
    expect(targetMembership).toContain('wm.user_id = p_actor_id');
    expect(targetMembership).toContain("wm.type = 'MEMBER'");

    const accessibleSources = source.match(
      /accessible_source_workspaces as \([\s\S]*?\),\n {2}scoped_tasks/u
    )?.[0];
    expect(accessibleSources).toContain('wm.user_id = p_actor_id');
    expect(accessibleSources).toContain("wm.type = 'MEMBER'");
  });

  it('keeps the private RPC service-role only', () => {
    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain(
      'revoke all on function private.list_task_source_filter_ids'
    );
    expect(source).toContain('from public, anon, authenticated');
    expect(source).toContain(
      'grant execute on function private.list_task_source_filter_ids'
    );
    expect(source).toContain('to service_role');
    expect(source).toContain("notify pgrst, 'reload schema'");
  });
});
