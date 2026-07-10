import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd().endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd();

const preservationMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260710101500_preserve_user_group_attendance_history.sql'
);
const attendanceSaverMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260619040604_user_group_session_rich_descriptions_attendance.sql'
);

describe('user group attendance membership hardening', () => {
  it('preserves attendance history when group membership is removed', () => {
    expect(existsSync(preservationMigrationPath)).toBe(true);

    const source = readFileSync(preservationMigrationPath, 'utf8');

    expect(source).toContain(
      'drop constraint if exists user_group_attendance_member_fkey'
    );
    expect(source).toContain('restore_cascaded_user_group_attendance');
    expect(source).toContain("membership_delete.op = 'DELETE'");
    expect(source).toContain('membership_delete.ts = attendance_event.ts');
    expect(source).toContain('on conflict do nothing');
  });

  it('requires the private attendance saver to validate group membership', () => {
    expect(existsSync(attendanceSaverMigrationPath)).toBe(true);

    const source = readFileSync(attendanceSaverMigrationPath, 'utf8');

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
