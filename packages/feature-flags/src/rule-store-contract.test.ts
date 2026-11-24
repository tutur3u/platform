import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLAG_KINDS } from './lifecycle.mjs';
import { runtimeDefinitionRows } from './rule-definitions';
import {
  RULE_CLIENTS,
  RULE_ENVIRONMENTS,
  RULE_MODES,
  type RuleMutationInput,
  ruleMutationError,
} from './rule-validation';
import { featureFlagCatalog } from './catalog';
import {
  RUNTIME_CONTROLLERS,
  type RuntimeDefinition,
} from './runtime-definition.mjs';

const read = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const sql = read(
  'apps/database/supabase/migrations/20261125030000_feature_flag_rules.sql'
);
const permission = read(
  'apps/database/supabase/migrations/20261125030100_manage_feature_flags_permission.sql'
);
const rollback = read(
  'apps/database/rollbacks/20261125030000_feature_flag_rules.rollback.sql'
);
const permissionRollback = read(
  'apps/database/rollbacks/20261125030100_manage_feature_flags_permission.rollback.sql'
);
const pgtap = read('apps/database/supabase/tests/feature-flag-rule-store.sql');

const WS = '11111111-1111-4111-8111-111111111111';
const USER = '33333333-3333-4333-8333-333333333333';

// Definitions mirrored by the pgTAP fixture's feature_flag_sync_definitions call.
const definitions: Record<
  string,
  Pick<RuntimeDefinition, 'scopes' | 'controllers'>
> = {
  FF_RULE_TEST: {
    scopes: ['platform', 'workspace', 'user'],
    controllers: {
      platform: 'platform-admin',
      workspace: 'workspace-admin',
      user: 'self',
    },
  },
  FF_RULE_PLATFORM_ONLY: {
    scopes: ['platform'],
    controllers: { platform: 'platform-admin' },
  },
};

const valid: RuleMutationInput = {
  operationId: '44444444-4444-4444-8444-444444444444',
  flagKey: 'FF_RULE_TEST',
  environment: 'production',
  scope: 'platform',
  subjectId: null,
  mode: 'on',
  percentage: null,
  allowWorkspaceIds: null,
  allowUserIds: null,
  expectedRevision: 0,
  reason: 'Enable for launch',
  client: 'admin-ui',
};

// Each case is asserted against the database in
// apps/database/supabase/tests/feature-flag-rule-store.sql as
// `'<code>', 'shape: <name>'`, so both validators agree on every row.
const cases: [string, Partial<RuleMutationInput>, string | null][] = [
  ['valid platform rule', {}, null],
  ['unknown flag', { flagKey: 'FF_RULE_MISSING' }, 'feature_flag_unknown_flag'],
  [
    'staging environment',
    { environment: 'staging' },
    'feature_flag_unknown_environment',
  ],
  ['invalid scope', { scope: 'team' }, 'feature_flag_invalid_scope'],
  [
    'undeclared scope',
    { flagKey: 'FF_RULE_PLATFORM_ONLY', scope: 'workspace', subjectId: WS },
    'feature_flag_scope_not_declared',
  ],
  ['platform subject', { subjectId: WS }, 'feature_flag_invalid_subject'],
  [
    'workspace without subject',
    { scope: 'workspace' },
    'feature_flag_invalid_subject',
  ],
  ['unknown mode', { mode: 'maybe' }, 'feature_flag_invalid_mode'],
  [
    'staff user rule',
    { scope: 'user', subjectId: USER, mode: 'staff' },
    'feature_flag_user_mode',
  ],
  [
    'rollout without percentage',
    { mode: 'rollout' },
    'feature_flag_invalid_percentage',
  ],
  [
    'rollout above 100',
    { mode: 'rollout', percentage: 101 },
    'feature_flag_invalid_percentage',
  ],
  [
    'negative rollout',
    { mode: 'rollout', percentage: -1 },
    'feature_flag_invalid_percentage',
  ],
  [
    'percentage outside rollout',
    { percentage: 50 },
    'feature_flag_invalid_percentage',
  ],
  [
    'unset with percentage',
    { mode: null, percentage: 5 },
    'feature_flag_invalid_percentage',
  ],
  [
    'allow-list outside rollout',
    { mode: 'staff', allowUserIds: [USER] },
    'feature_flag_invalid_allow_list',
  ],
  [
    'oversized allow-list',
    {
      mode: 'rollout',
      percentage: 0,
      allowWorkspaceIds: Array.from({ length: 501 }, () => WS),
    },
    'feature_flag_invalid_allow_list',
  ],
  [
    'null allow-list entry',
    { mode: 'rollout', percentage: 0, allowUserIds: [null] },
    'feature_flag_invalid_allow_list',
  ],
  ['blank reason', { reason: '   ' }, 'feature_flag_invalid_reason'],
  ['long reason', { reason: 'x'.repeat(501) }, 'feature_flag_invalid_reason'],
  ['unknown client', { client: 'cron' }, 'feature_flag_invalid_client'],
  [
    'negative revision',
    { expectedRevision: -1 },
    'feature_flag_invalid_revision',
  ],
  [
    'self user rule on',
    { scope: 'user', subjectId: USER, mode: 'on' },
    'feature_flag_self_mode',
  ],
  [
    'valid rollout',
    { mode: 'rollout', percentage: 25, allowWorkspaceIds: [WS] },
    null,
  ],
];

describe('rule validation agrees with the rule store', () => {
  it.each(cases)('%s', (name, partial, code) => {
    const input = { ...valid, ...partial };
    const key = typeof input.flagKey === 'string' ? input.flagKey : '';
    expect(ruleMutationError(input, definitions[key])).toBe(code);
    // The database asserts the same outcome for the same named case.
    expect(pgtap).toContain(`'${code ?? 'applied'}', 'shape: ${name}'`);
    if (code !== null) {
      expect(sql).toMatch(new RegExp(`(?:raise exception|then) '${code}'`));
    }
  });

  it('enforces the same shape function in the CHECK and the mutate RPC', () => {
    expect(sql).toContain(
      'private.feature_flag_rule_shape_error(\n      scope, subject_id, mode, percentage, allow_workspace_ids, allow_user_ids\n    ) is null'
    );
    expect(sql).toContain(
      'v_error := private.feature_flag_rule_shape_error(\n    p_scope, p_subject_id, p_mode, p_percentage, p_allow_workspace_ids, p_allow_user_ids\n  );'
    );
    expect(sql).toContain(
      `p_mode not in (${RULE_MODES.map((mode) => `'${mode}'`).join(', ')})`
    );
    expect(sql).toContain(
      "p_scope = 'user' and p_mode is not null and p_mode not in ('on', 'off')"
    );
    expect(sql.match(/cardinality\(p_allow_\w+_ids\) > 500/g)).toHaveLength(2);
    expect(sql).toContain(
      `environment in (${RULE_ENVIRONMENTS.map((env) => `'${env}'`).join(', ')})`
    );
    expect(sql).toContain(
      `p_client not in (${RULE_CLIENTS.map((client) => `'${client}'`).join(', ')})`
    );
    expect(sql).toContain(
      `client in (${[...RULE_CLIENTS, 'erasure'].map((client) => `'${client}'`).join(', ')})`
    );
    expect(sql).toContain(
      'unique nulls not distinct (flag_key, scope, subject_id, environment)'
    );
  });

  it('mirrors the runtime definition rules', () => {
    expect(sql).toContain(
      `p_kind not in (${FLAG_KINDS.map((kind) => `'${kind}'`).join(', ')})`
    );
    expect(RUNTIME_CONTROLLERS.workspace).toEqual([
      'platform-admin',
      'workspace-admin',
    ]);
    expect(RUNTIME_CONTROLLERS.user).toEqual(['platform-admin', 'self']);
    expect(sql).toContain(
      `p_controllers -> 'workspace' not in ('"platform-admin"'::jsonb, '"workspace-admin"'::jsonb)`
    );
    expect(sql).toContain(
      `p_controllers -> 'user' not in ('"platform-admin"'::jsonb, '"self"'::jsonb)`
    );
    for (const row of runtimeDefinitionRows(featureFlagCatalog.flags)) {
      expect(row.key).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,99}$/);
      expect(row.scopes).toContain('platform');
      expect(row.delegate === null || row.scopes.includes('workspace')).toBe(
        true
      );
    }
  });

  it('keeps tables private and grants execute only to service_role', () => {
    for (const table of ['definitions', 'rules', 'audit', 'definition_audit']) {
      expect(sql).toContain(
        `revoke all on table private.feature_flag_${table}\n  from public, anon, authenticated, service_role;`
      );
    }
    const grants: [string, string[]][] = [
      [
        sql,
        [
          'feature_flag_sync_definitions(jsonb, boolean)',
          'feature_flag_mutate_rule(uuid, uuid, text, text, text, uuid, text, integer, uuid[], uuid[], bigint, text, text)',
        ],
      ],
      [
        permission,
        [
          'feature_flag_read_snapshot(text)',
          'feature_flag_read_subject_rules(text, uuid, uuid)',
          'feature_flag_read_rules(uuid, text, text)',
          'feature_flag_read_audit(uuid, integer, timestamptz, uuid)',
          'feature_flag_erase_subject(text, uuid)',
        ],
      ],
    ];
    for (const [source, names] of grants) {
      expect(source.split('\n').length).toBeLessThanOrEqual(700);
      const definers = [
        ...source.matchAll(/create function (private\.\w+)\(/g),
      ];
      const bodies = [...source.matchAll(/as \$flag\$/g)];
      expect(
        source.match(/set search_path = pg_catalog, pg_temp/g)?.length
      ).toBe(bodies.length);
      expect(definers.length).toBe(bodies.length);
      for (const name of names) {
        expect(source).toContain(
          `grant execute on function private.${name}\n  to service_role;`
        );
      }
      expect(source.match(/^grant /gm)).toHaveLength(names.length);
      expect(source).not.toMatch(
        /^grant[^;]*to (?:anon|authenticated|public)\b/im
      );
    }
    // Every service-role RPC also refuses a non-service request JWT.
    expect(
      (sql + permission).match(
        /perform private\.feature_flag_require_service_role\(\);/g
      )
    ).toHaveLength(7);
    expect(sql).toContain("array['manage_feature_flags']::text[]");
    expect(sql).toContain("'manage_workspace_settings'");
    expect(permission).toContain(
      "array['view_infrastructure', 'manage_feature_flags']::text[]"
    );
    expect(permission).toContain(
      "add value if not exists 'manage_feature_flags'"
    );
  });

  it('bounds replay, subject reads and control widening', () => {
    expect(sql).toContain("raise exception 'feature_flag_operation_conflict'");
    expect(sql).toContain('v_audit.actor_id is distinct from p_actor');
    expect(sql).toContain("raise exception 'feature_flag_rule_limit'");
    expect(sql).toContain(') >= 50000 then');
    expect(sql).toContain("raise exception 'feature_flag_write_lost'");
    expect(sql).toContain(
      "raise exception 'feature_flag_definition_widens_control'"
    );
    expect(sql).toContain('insert into private.feature_flag_definition_audit');
    expect(permission).toContain(
      "where r.environment = p_environment and r.scope = 'platform' and r.mode is not null;"
    );
    expect(permission).toContain('(occurred_at, id) < (p_before, p_before_id)');
  });

  it('guards writes and keeps the audit append-only', () => {
    expect(sql).toContain(
      "execute function private.feature_flag_guard_write('mutate_rule')"
    );
    expect(sql).toContain(
      "execute function private.feature_flag_guard_write('sync_definitions')"
    );
    expect(sql).toContain(
      "set_config('feature_flags.entrypoint', 'mutate_rule', true)"
    );
    expect(sql).toContain('before truncate on private.feature_flag_audit');
    expect(
      sql.match(/set_config\('feature_flags\.entrypoint', '', true\)/g)
    ).toHaveLength(2);
    expect(
      permission.match(/set_config\('feature_flags\.entrypoint', '', true\)/g)
    ).toHaveLength(1);
    expect(sql).toContain("v_entry = 'erase_subject'");
    expect(sql).not.toMatch(/delete from private\.feature_flag/i);
    expect(sql).not.toContain('platform_feature_flag');
  });

  it('rolls back every object without a client grant', () => {
    for (const [source, undo] of [
      [sql, rollback],
      [permission, permissionRollback],
    ] as const) {
      for (const match of source.matchAll(
        /create (?:function|table) (private\.\w+)/g
      )) {
        expect(undo).toContain(match[1]);
      }
      expect(undo.toLowerCase()).not.toContain('grant ');
      expect(undo).not.toContain('platform_feature_flag');
    }
  });
});
