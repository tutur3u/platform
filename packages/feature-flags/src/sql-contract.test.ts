import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { featureFlagCatalog, registry } from './index';

const migrationPath = new URL(
  '../../../apps/database/supabase/migrations/20261109170000_platform_feature_flag_state_audit.sql',
  import.meta.url
);
const rollbackPath = new URL(
  '../../../apps/database/rollbacks/20261109170000_platform_feature_flag_state_audit.rollback.sql',
  import.meta.url
);
const sql = readFileSync(migrationPath, 'utf8');
const rollback = readFileSync(rollbackPath, 'utf8');

function functionBodies(source: string): string[] {
  return [...source.matchAll(/as \$flag\$([\s\S]*?)\$flag\$/g)].map(
    (match) => match[1] ?? ''
  );
}

describe('platform feature flag migration contract', () => {
  it('defines revisioned state and append-only audit in one source file', () => {
    expect(sql.split('\n').length).toBeLessThanOrEqual(700);
    expect(sql).toContain('create table private.platform_feature_flag_state');
    expect(sql).toContain('create table private.platform_feature_flag_audit');
    expect(sql).toContain(
      'constraint platform_feature_flag_audit_operation_key unique (operation_id)'
    );
    expect(sql).toContain('new_revision = old_revision + 1');
    expect(sql).not.toContain('commit');
    expect(sql).not.toContain('create function public.is_org_member');
    expect(sql).not.toContain('get_user_role');
    expect(sql).toContain("'00000000-0000-0000-0000-000000000000'::uuid");
    expect(sql).toContain('public.has_workspace_permission');
  });

  it('pins search_path, revokes client DML, and grants execute only to service_role', () => {
    const bodies = functionBodies(sql);
    expect(bodies.length).toBeGreaterThanOrEqual(6);
    expect(sql.match(/set search_path = pg_catalog, pg_temp/g)?.length).toBe(
      bodies.length
    );
    for (const table of [
      'private.platform_feature_flag_state',
      'private.platform_feature_flag_audit',
    ]) {
      expect(sql).toContain(
        `revoke all on table ${table}\n  from public, anon, authenticated, service_role;`
      );
    }
    expect(sql).not.toMatch(
      /grant\s+(?:all|select|insert|update|delete)[\s\S]{0,80}to\s+(?:anon|authenticated|public)/i
    );
    expect(sql).toContain(
      'grant execute on function private.platform_feature_flag_mutate(uuid, uuid, text, text, boolean, bigint)\n  to service_role;'
    );
    expect(sql).toContain(
      'grant execute on function private.platform_feature_flag_runtime_read(text)\n  to service_role;'
    );
    expect(sql).not.toMatch(
      /grant execute[\s\S]{0,160}to (?:anon|authenticated|public)/i
    );
  });

  it('rejects direct writes and audit mutation inside the database', () => {
    expect(sql).toContain('platform_feature_flag_direct_write');
    expect(sql).toContain('platform_feature_flag_state_delete');
    expect(sql).toContain('platform_feature_flag_audit_immutable');
    expect(sql).toContain(
      'before update or delete on private.platform_feature_flag_audit'
    );
    expect(sql).toContain(
      'before insert or update or delete on private.platform_feature_flag_state'
    );
    expect(sql).toContain(
      "set_config('platform_feature_flags.entrypoint', 'mutate', true)"
    );
    expect(sql).not.toMatch(
      /delete from private\.platform_feature_flag_state/i
    );
  });

  it('keeps the mutation and audit insert in one function with a revision lock', () => {
    const mutate = sql.slice(
      sql.indexOf('create function private.platform_feature_flag_mutate'),
      sql.indexOf('comment on function private.platform_feature_flag_mutate')
    );
    expect(mutate).toContain('pg_advisory_xact_lock');
    expect(mutate).toContain('for update');
    expect(mutate).toContain('insert into private.platform_feature_flag_state');
    expect(mutate).toContain('insert into private.platform_feature_flag_audit');
    expect(mutate).toContain('when unique_violation');
    expect(mutate).toContain('clock_timestamp()');
    expect(mutate).toContain("'manage_workspace_roles'");
    expect(
      mutate.indexOf('insert into private.platform_feature_flag_state')
    ).toBeLessThan(
      mutate.indexOf('insert into private.platform_feature_flag_audit')
    );
    expect(sql).toContain("'view_infrastructure'");
    expect(sql).toContain('least(greatest(coalesce(p_limit, 50), 1), 100)');
  });

  it('allowlists the pinned catalog and does not admit cookie consent', () => {
    for (const flag of featureFlagCatalog.flags) {
      expect(sql).toContain(`when '${flag.key}' then '${flag.family}'`);
    }
    expect(sql).not.toContain('cookie_consent_banner');
    for (const flag of registry) {
      expect(sql).toContain(`when '${flag.key}' then 'mobile-runtime'`);
    }
    expect(featureFlagCatalog.flags).toHaveLength(51);
    expect(registry).toHaveLength(16);
  });

  it('rolls back by dropping the new objects without a client grant', () => {
    expect(rollback).toContain(
      'drop function if exists private.platform_feature_flag_mutate(uuid, uuid, text, text, boolean, bigint);'
    );
    expect(rollback).toContain(
      'drop table if exists private.platform_feature_flag_audit;'
    );
    expect(rollback).toContain(
      'drop table if exists private.platform_feature_flag_state;'
    );
    expect(rollback.toLowerCase()).not.toContain('grant ');
  });
});
