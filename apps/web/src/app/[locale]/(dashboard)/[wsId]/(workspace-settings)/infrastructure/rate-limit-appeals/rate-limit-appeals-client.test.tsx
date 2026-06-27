import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitAppealsClient } from './rate-limit-appeals-client';

const mocks = vi.hoisted(() => ({
  approveRateLimitAppeal: vi.fn(),
  closeRateLimitAppeal: vi.fn(),
  listRateLimitAppeals: vi.fn(),
  rejectRateLimitAppeal: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@tuturuuu/icons', () => ({
  Check: (props: Record<string, unknown>) => <span {...props}>check</span>,
  Loader2: (props: Record<string, unknown>) => <span {...props}>loading</span>,
  X: (props: Record<string, unknown>) => <span {...props}>x</span>,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  approveRateLimitAppeal: (...args: unknown[]) =>
    mocks.approveRateLimitAppeal(...args),
  closeRateLimitAppeal: (...args: unknown[]) =>
    mocks.closeRateLimitAppeal(...args),
  listRateLimitAppeals: (...args: unknown[]) =>
    mocks.listRateLimitAppeals(...args),
  rejectRateLimitAppeal: (...args: unknown[]) =>
    mocks.rejectRateLimitAppeal(...args),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'actions.approve': 'Approve',
      'actions.close': 'Close',
      'actions.open_blocked_ip': 'Open Blocked IP',
      'actions.open_live_usage': 'Open Live Usage',
      'actions.open_rate_limits': 'Open Rate Limits',
      'actions.reject': 'Reject',
      'actions.retry': 'Retry',
      diagnostics: 'Captured diagnostics',
      empty: 'No appeals match the current filters.',
      'error.description': 'Something went wrong loading appeals.',
      'error.title': 'Failed to load appeals',
      'fields.block_reason': 'Block reason',
      'fields.expires_days': 'Expires in days',
      'fields.multiplier': 'Multiplier',
      'fields.relief_until': 'Temporary relief until',
      'fields.review_note': 'Review note',
      'fields.workspace': 'Workspace',
      'fields.workspace_id': 'Workspace ID',
      'filters.all': 'All statuses',
      'filters.search': 'Search IP or workspace ID',
      'statuses.approved': 'Approved',
      'statuses.closed': 'Closed',
      'statuses.pending': 'Pending',
      'statuses.rejected': 'Rejected',
      'toasts.approved': 'Appeal approved',
      'toasts.approve_failed': 'Failed to approve appeal',
      'toasts.closed': 'Appeal closed',
      'toasts.close_failed': 'Failed to close appeal',
      'toasts.rejected': 'Appeal rejected',
      'toasts.reject_failed': 'Failed to reject appeal',
    };
    return translations[key] ?? key;
  },
}));

function renderWithQueryClient(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('RateLimitAppealsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRateLimitAppeals.mockResolvedValue({
      appeals: [
        {
          cleared_blocked_ip_id: null,
          client_ip: '203.0.113.10',
          created_at: '2026-06-27T01:00:00.000Z',
          created_rate_limit_rule_id: null,
          creator_id: 'user-1',
          diagnostics: {
            limit: { proxyBlockReason: 'ip-already-blocked' },
            request: {
              method: 'GET',
              requestPath:
                '/api/v1/workspaces/e9e2073c-7072-4e86-a268-b6e48f541fd5/users/groups',
            },
          },
          id: '42529372-c669-4833-bb32-2cab1f4ffd83',
          message: 'Legitimate classroom usage',
          page_path: null,
          proxy_block_reason: 'ip-already-blocked',
          rate_limit_policy: 'workspace-dashboard-read',
          rate_limit_window: 'minute',
          request_method: 'GET',
          request_path:
            '/api/v1/workspaces/e9e2073c-7072-4e86-a268-b6e48f541fd5/users/groups',
          response_status: 429,
          review_note: null,
          reviewed_at: null,
          reviewed_by: null,
          retry_after_seconds: 32,
          status: 'pending',
          temporary_relief_expires_at: '2026-06-27T01:15:00.000Z',
          temporary_relief_granted_at: '2026-06-27T01:00:00.000Z',
          timezone: 'Asia/Ho_Chi_Minh',
          turnstile_verified_at: '2026-06-27T01:00:00.000Z',
          updated_at: '2026-06-27T01:00:00.000Z',
          user_agent: 'Vitest',
          user_email: 'member@example.com',
          workspace_id: 'e9e2073c-7072-4e86-a268-b6e48f541fd5',
        },
      ],
      summary: { approved: 0, closed: 0, pending: 1, rejected: 0, total: 1 },
    });
    mocks.approveRateLimitAppeal.mockResolvedValue({
      appeal: { id: '42529372-c669-4833-bb32-2cab1f4ffd83' },
      rule: { id: 'rule-1' },
      unblocked: true,
    });
  });

  it('renders pending appeals and approves with trusted workspace defaults', async () => {
    renderWithQueryClient(
      <RateLimitAppealsClient canManage wsId="root-workspace" />
    );

    expect(await screen.findByText('203.0.113.10')).toBeVisible();
    expect(screen.getByText('Legitimate classroom usage')).toBeVisible();
    expect(screen.getByLabelText('Workspace ID')).toHaveValue(
      'e9e2073c-7072-4e86-a268-b6e48f541fd5'
    );
    expect(screen.getByLabelText('Multiplier')).toHaveValue(3);
    expect(screen.getByLabelText('Expires in days')).toHaveValue(30);

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() =>
      expect(mocks.approveRateLimitAppeal).toHaveBeenCalledWith(
        '42529372-c669-4833-bb32-2cab1f4ffd83',
        expect.objectContaining({
          expiresInDays: 30,
          trustMultiplier: 3,
          workspaceId: 'e9e2073c-7072-4e86-a268-b6e48f541fd5',
        })
      )
    );
  });
});
