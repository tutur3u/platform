import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseTabs } from './database-tabs';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/ws-1/users/database',
  useRouter: () => ({
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams('tab=audit-log'),
}));

describe('DatabaseTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders only tabs the current user is allowed to access', () => {
    render(
      <DatabaseTabs
        activeTab="audit-log"
        canViewUsers={false}
        canViewAuditLog
        auditLogContent={<div>audit content</div>}
      />
    );

    expect(screen.queryByText('ws-users.plural')).not.toBeInTheDocument();
    expect(screen.getByText('ws-users.audit_log')).toBeInTheDocument();
  });
});
