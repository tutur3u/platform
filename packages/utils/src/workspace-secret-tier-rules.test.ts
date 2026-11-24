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

/** The rows the tier-mirror migration seeds, parsed from its SQL. */
function migrationTierRows(): WorkspaceSecretTierRule[] {
  const file = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .find((name) =>
      readFileSync(join(MIGRATIONS_DIR, name), 'utf8').includes(
        'CREATE TABLE private.workspace_secret_name_tiers'
      )
    );
  if (!file) throw new Error('tier mirror migration not found');

  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  const insert = sql.slice(
    sql.indexOf('INSERT INTO private.workspace_secret_name_tiers'),
    sql.indexOf(
      ';',
      sql.indexOf('INSERT INTO private.workspace_secret_name_tiers')
    )
  );
  const row =
    /\((\d+), '(exact|prefix|pattern)', '((?:[^']|'')*)', '(config|credential)', (true|false), '(boolean|json|number|string)'\)/gu;
  return [...insert.matchAll(row)].map((match) => ({
    clientVisible: match[5] === 'true',
    kind: match[2] as WorkspaceSecretTierRule['kind'],
    match: (match[3] ?? '').replaceAll("''", "'"),
    priority: Number(match[1]),
    tier: match[4] as WorkspaceSecretTierRule['tier'],
    type: match[6] as WorkspaceSecretTierRule['type'],
  }));
}

describe('workspace secret tier rules', () => {
  it('equal the rows the database tier mirror seeds', () => {
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
});
