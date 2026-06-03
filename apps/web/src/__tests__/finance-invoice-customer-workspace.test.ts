import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd().endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd();

const migrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260603001609_bind_invoice_customers_to_workspace.sql'
);

describe('finance invoice customer workspace migration', () => {
  it('enforces future invoice customers against the invoice workspace', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain('workspace_users_ws_id_id_key');
    expect(source).toContain('finance_invoices_customer_workspace_fkey');
    expect(source).toContain('foreign key (ws_id, customer_id)');
    expect(source).toContain('references public.workspace_users (ws_id, id)');
    expect(source).toContain('not valid');
  });

  it('keeps invoice search customer joins workspace-bound', () => {
    const source = readFileSync(migrationPath, 'utf8');

    expect(source).toContain(
      'create or replace function public.search_finance_invoices'
    );
    expect(source.match(/fi\.customer_id = wu\.id/g) ?? []).toHaveLength(2);
    expect(source.match(/fi\.ws_id = wu\.ws_id/g) ?? []).toHaveLength(2);
  });
});
