import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd().endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd();

const migrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260603095000_harden_user_group_attendance_membership.sql'
);

describe('user group attendance membership hardening', () => {
  it('enforces future attendance rows against the group membership junction', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain('user_group_attendance_member_fkey');
    expect(source).toContain('foreign key (user_id, group_id)');
    expect(source).toContain(
      'references public.workspace_user_groups_users (user_id, group_id)'
    );
    expect(source).toContain('not valid');
  });

  it('requires the private attendance saver to validate group membership', () => {
    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain(
      'create or replace function "private"."admin_save_user_group_attendance_with_audit_actor"'
    );
    expect(source).toContain(
      'join "public"."workspace_user_groups_users" group_member'
    );
    expect(source).toContain('and group_member."group_id" = p_group_id');
    expect(source).toContain('invalid_attendance_group_member');
  });
});
