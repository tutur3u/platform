import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd().endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd();

const migrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260602190339_harden_mind_ai_patch_board_scope.sql'
);

describe('Mind AI patch board scope migration', () => {
  it('validates board workspace before AI patch, thread, and message writes', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const source = readFileSync(migrationPath, 'utf8');

    for (const functionName of [
      'mind_create_ai_patch',
      'mind_ensure_ai_thread',
      'mind_persist_ai_message',
    ]) {
      expect(source).toContain(
        `create or replace function private.${functionName}`
      );
      expect(source).toContain('from private.mind_boards b');
      expect(source).toContain('where b.id = p_board_id');
      expect(source).toContain('and b.ws_id = p_ws_id');
    }

    expect(source).toContain("raise exception 'Mind board not found'");
    expect(source).toContain("raise exception 'Mind AI thread not found'");
    expect(source).toContain(
      "raise exception 'Mind AI thread board workspace mismatch'"
    );
  });

  it('applies AI patches only after joining the patch board to the route workspace', () => {
    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain(
      'create or replace function private.mind_apply_ai_patch'
    );
    expect(source).toContain('from private.mind_ai_patches p');
    expect(source).toContain('join private.mind_boards b');
    expect(source).toContain('on b.id = p.board_id');
    expect(source).toContain('and b.ws_id = p_ws_id');
    expect(source).toContain('where p.id = p_patch_id');
    expect(source).toContain('and p.ws_id = p_ws_id');
    expect(source).toContain('for update of p');
  });

  it('keeps board summary counts scoped to the board workspace', () => {
    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain(
      'create or replace function private.mind_board_json'
    );
    expect(source).toContain('from private.mind_nodes n');
    expect(source).toContain('where n.board_id = b.id');
    expect(source).toContain('and n.ws_id = b.ws_id');
    expect(source).toContain('from private.mind_edges e');
    expect(source).toContain('where e.board_id = b.id');
    expect(source).toContain('and e.ws_id = b.ws_id');
    expect(source).toContain('from private.mind_tags t');
    expect(source).toContain('where t.board_id = b.id');
    expect(source).toContain('and t.ws_id = b.ws_id');
  });

  it('adds composite workspace constraints for new Mind graph and AI rows', () => {
    const source = readFileSync(migrationPath, 'utf8');

    for (const constraint of [
      'mind_nodes_board_workspace_fk',
      'mind_nodes_parent_board_workspace_fk',
      'mind_edges_board_workspace_fk',
      'mind_edges_source_board_workspace_fk',
      'mind_edges_target_board_workspace_fk',
      'mind_ai_threads_board_workspace_fk',
      'mind_ai_messages_board_workspace_fk',
      'mind_ai_messages_thread_workspace_fk',
      'mind_ai_patches_board_workspace_fk',
      'mind_ai_patches_thread_workspace_fk',
    ]) {
      expect(source).toContain(`add constraint ${constraint}`);
    }

    expect(source).toContain('references private.mind_boards(id, ws_id)');
    expect(source).toContain(
      'references private.mind_nodes(id, board_id, ws_id)'
    );
    expect(source).toContain('references private.mind_ai_threads(id, ws_id)');
    expect(source.match(/not valid;/g) ?? []).toHaveLength(12);
  });
});
