import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  matchWorkspaceSecretTierRule,
  WORKSPACE_SECRET_TIER_RULES,
  type WorkspaceSecretTierRule,
} from './workspace-secret-tier-rules';

const MIGRATIONS_DIR = resolve(
  __dirname,
  '../../../apps/database/supabase/migrations'
);

const TIER_INSERT = 'INSERT INTO private.workspace_secret_name_tiers';

/**
 * Every row the migrations insert into the tier mirror, in migration order:
 * the seed in the migration that creates the table, then rows later
 * migrations add.
 */
function migrationTierRows(): WorkspaceSecretTierRule[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) =>
      readFileSync(join(MIGRATIONS_DIR, name), 'utf8').includes(TIER_INSERT)
    );
  if (files.length === 0) throw new Error('tier mirror migration not found');

  const row =
    /\((\d+), '(exact|prefix|pattern)', '((?:[^']|'')*)', '(config|credential)', (true|false), '(boolean|json|number|string)'\)/gu;
  return files.flatMap((file) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const rows: WorkspaceSecretTierRule[] = [];
    for (
      let at = sql.indexOf(TIER_INSERT);
      at !== -1;
      at = sql.indexOf(TIER_INSERT, at + 1)
    ) {
      const insert = sql.slice(at, sql.indexOf(';', at));
      for (const match of insert.matchAll(row)) {
        rows.push({
          clientVisible: match[5] === 'true',
          kind: match[2] as WorkspaceSecretTierRule['kind'],
          match: (match[3] ?? '').replaceAll("''", "'"),
          priority: Number(match[1]),
          tier: match[4] as WorkspaceSecretTierRule['tier'],
          type: match[6] as WorkspaceSecretTierRule['type'],
        });
      }
    }
    return rows;
  });
}

describe('workspace secret tier rules', () => {
  it('equal the rows the migrations insert into the database tier mirror', () => {
    const sqlRows = migrationTierRows();
    expect(sqlRows.length).toBe(WORKSPACE_SECRET_TIER_RULES.length);
    expect(sqlRows).toEqual(
      WORKSPACE_SECRET_TIER_RULES.map((rule) => ({ ...rule }))
    );
  });

  it('use unique priorities and only shared regex syntax', () => {
    const priorities = WORKSPACE_SECRET_TIER_RULES.map((rule) => rule.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
    for (const rule of WORKSPACE_SECRET_TIER_RULES) {
      if (rule.kind !== 'pattern') continue;
      // No escapes, lookarounds, non-capturing groups or flags: these read
      // differently in Postgres advanced regular expressions.
      expect(rule.match).not.toMatch(/\\|\(\?|\{/u);
      expect(rule.match.startsWith('^') && rule.match.endsWith('$')).toBe(true);
    }
  });

  it('never makes a credential name client-visible', () => {
    for (const rule of WORKSPACE_SECRET_TIER_RULES) {
      if (rule.tier === 'credential') expect(rule.clientVisible).toBe(false);
    }
    expect(matchWorkspaceSecretTierRule('UNREGISTERED')).toBeUndefined();
  });

  it('registers newsletter_sending as a client-visible boolean config flag', () => {
    expect(matchWorkspaceSecretTierRule('newsletter_sending')).toMatchObject({
      clientVisible: true,
      tier: 'config',
      type: 'boolean',
    });
    // Names are case-sensitive, as in private.workspace_secret_name_tier.
    expect(matchWorkspaceSecretTierRule('NEWSLETTER_SENDING')).toBeUndefined();
  });
});
