import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd().endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd();

const migrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260603000201_secure_transaction_type_confidential_filters.sql'
);

describe('finance transaction type confidential filter migration', () => {
  it('patches every transaction-type RPC that can classify amount signs', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const source = readFileSync(migrationPath, 'utf8');

    for (const signature of [
      'public.get_transaction_stats(uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone)',
      'public.get_wallet_transactions_with_permissions(uuid,uuid,uuid[],uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone,text,text,integer,integer,timestamp with time zone,timestamp with time zone,boolean)',
      'public.get_transactions_by_period(uuid,text,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,text)',
    ]) {
      expect(source).toContain(signature);
    }

    expect(source).toContain(
      '(NOT wt.is_amount_confidential OR v_can_view_amount)'
    );
    expect(source).toContain('($1 OR NOT wt.is_amount_confidential)');
  });

  it('fails migration execution if the expected predicate is absent', () => {
    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain(
      "raise exception 'Expected transaction type predicate not found in %'"
    );
    expect(
      source.match(/if v_replaced = v_definition then/g) ?? []
    ).toHaveLength(3);
    expect(source).toContain("notify pgrst, 'reload schema'");
  });
});
