import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FinancePermissionWarningContent } from './finance-permission-warning-dialog';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('FinancePermissionWarningContent', () => {
  it('shows missing permissions and request identity details', () => {
    render(
      <FinancePermissionWarningContent
        missingPermissions={['create_invoices']}
        user={{
          displayName: 'Jane Doe',
          email: 'jane@example.com',
          id: 'user-1',
        }}
      />
    );

    expect(screen.getByText('create_invoices')).toBeVisible();
    expect(screen.getByText('user-1')).toBeVisible();
    expect(screen.getByText('Jane Doe')).toBeVisible();
  });
});
