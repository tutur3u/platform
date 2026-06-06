import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd().endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd();

const subscriptionContextRoutePath = resolve(
  repoRoot,
  'apps/web/src/app/api/v1/workspaces/[wsId]/finance/invoices/subscription/context/route.ts'
);

describe('subscription invoice context route', () => {
  it('uses only completed invoices as paid subscription coverage', () => {
    const source = readFileSync(subscriptionContextRoutePath, 'utf8');

    expect(source).toContain(
      'finance_invoices!inner(valid_until, created_at, completed_at)'
    );
    expect(source).toContain(
      ".not('finance_invoices.completed_at', 'is', null)"
    );
  });
});
