import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd().endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd();

const migrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260603003639_bound_task_list_task_counts.sql'
);

describe('task board list task count migration', () => {
  it('adds a private grouped count RPC for board lists', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain(
      'create or replace function private.get_task_board_list_task_counts'
    );
    expect(source).toContain('returns table');
    expect(source).toContain('count(tasks.id)::bigint as task_count');
    expect(source).toContain('group by task_lists.id');
  });

  it('keeps the count RPC service-role owned', () => {
    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain(
      'revoke all on function private.get_task_board_list_task_counts(uuid)'
    );
    expect(source).toContain(
      'grant execute on function private.get_task_board_list_task_counts(uuid)'
    );
    expect(source).toContain('to service_role');
    expect(source).toContain("notify pgrst, 'reload schema'");
  });
});
