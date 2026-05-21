import { describe, expect, it } from 'vitest';
import { buildFinanceAppRedirectUrl } from './redirect';

describe('buildFinanceAppRedirectUrl', () => {
  it('preserves query params when redirecting old Finance routes', () => {
    expect(
      buildFinanceAppRedirectUrl({
        origin: 'https://finance.tuturuuu.com',
        path: '/transactions',
        searchParams: {
          page: 2,
          q: 'tuition invoice',
          userIds: ['user-1', 'user-2'],
        },
        workspaceSlug: 'personal',
      })
    ).toBe(
      'https://finance.tuturuuu.com/personal/transactions?page=2&q=tuition+invoice&userIds=user-1&userIds=user-2'
    );
  });

  it('maps legacy nested category routes to standalone category URLs', () => {
    expect(
      buildFinanceAppRedirectUrl({
        origin: 'https://finance.tuturuuu.com',
        path: 'categories',
        searchParams: {
          type: 'expense',
        },
        workspaceSlug: 'internal',
      })
    ).toBe('https://finance.tuturuuu.com/internal/categories?type=expense');
  });

  it('keeps canonical workspace slugs without adding the old finance segment', () => {
    expect(
      buildFinanceAppRedirectUrl({
        origin: 'https://finance.tuturuuu.com',
        path: '',
        searchParams: {
          filter: null,
          view: 'summary',
        },
        workspaceSlug: 'workspace-123',
      })
    ).toBe('https://finance.tuturuuu.com/workspace-123?view=summary');
  });
});
