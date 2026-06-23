import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitDetailsDialog } from '@/components/rate-limit-details-dialog';
import type { RateLimitDebugDetails } from '@/lib/fetch-interceptor';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('@tuturuuu/icons/lucide-static', () => ({
  AlertTriangle: (props: Record<string, unknown>) => (
    <span aria-hidden="true" {...props}>
      alert
    </span>
  ),
  Copy: (props: Record<string, unknown>) => (
    <span aria-hidden="true" {...props}>
      copy
    </span>
  ),
}));

vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <footer>{children}</footer>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
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
      close: 'Close',
      rate_limited_copied: 'Rate-limit details copied',
      rate_limited_copy_details: 'Copy details',
      rate_limited_copy_failed: 'Failed to copy rate-limit details',
      rate_limited_details_description:
        'Share this information with support if the limit looks incorrect.',
      rate_limited_debug_warning_description:
        'This verified Tuturuuu staff session was allowed through so you can keep debugging. The limit still triggered.',
      rate_limited_debug_warning_title: 'Debug bypass active',
      'rate_limited_details_fields.caller_class': 'Caller class',
      'rate_limited_details_fields.captured_at': 'Captured at',
      'rate_limited_details_fields.client_ip': 'Current IP',
      'rate_limited_details_fields.debug_bypass': 'Debug bypass',
      'rate_limited_details_fields.limit': 'Limit',
      'rate_limited_details_fields.method': 'Method',
      'rate_limited_details_fields.page': 'Page',
      'rate_limited_details_fields.policy': 'Policy',
      'rate_limited_details_fields.proxy_block_reason': 'Proxy block reason',
      'rate_limited_details_fields.rate_limit_status': 'Original status',
      'rate_limited_details_fields.remaining': 'Remaining',
      'rate_limited_details_fields.request': 'Request',
      'rate_limited_details_fields.reset': 'Reset',
      'rate_limited_details_fields.retry_after': 'Retry after',
      'rate_limited_details_fields.retry_attempt': 'Retry attempt',
      'rate_limited_details_fields.status': 'Status',
      'rate_limited_details_fields.timezone': 'Timezone',
      'rate_limited_details_fields.user_agent': 'User agent',
      'rate_limited_details_fields.user_email': 'User email',
      'rate_limited_details_fields.user_id': 'User ID',
      'rate_limited_details_fields.warning': 'Warning',
      'rate_limited_details_fields.will_retry': 'Will retry',
      'rate_limited_details_fields.window': 'Window',
      'rate_limited_details_sections.environment': 'Environment',
      'rate_limited_details_sections.headers': 'Headers',
      'rate_limited_details_sections.identity': 'Identity',
      'rate_limited_details_sections.limit': 'Limit',
      'rate_limited_details_sections.request': 'Request',
      rate_limited_details_title: 'Rate-limit details',
    };

    return translations[key] ?? key;
  },
}));

const details: RateLimitDebugDetails = {
  capturedAt: '2026-06-18T08:00:00.000Z',
  clientIp: '203.0.113.10',
  debugBypass: 'tuturuuu-staff',
  headers: {
    'CF-Ray': 'ray-123',
    'Retry-After': '7',
    'X-RateLimit-Caller-Class': 'authenticated',
    'X-RateLimit-Client-IP': '203.0.113.10',
    'X-RateLimit-Debug-Bypass': 'tuturuuu-staff',
    'X-RateLimit-Limit': '600',
    'X-RateLimit-Original-Status': '429',
    'X-RateLimit-Policy': 'users-me',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': '1893456000',
    'X-RateLimit-User-Email': 'member@tuturuuu.com',
    'X-RateLimit-User-Id': 'user-123',
    'X-RateLimit-Warning': 'staff-debug-bypass',
    'X-RateLimit-Window': 'minute',
    'X-Request-Id': 'req-123',
  },
  maxRetries: 3,
  method: 'GET',
  pagePath: '/en/settings?tab=rate-limits',
  rateLimitStatus: 429,
  requestPath: '/api/v1/users/me/profile?token=[redacted]&tab=settings',
  retryAfterSeconds: 7,
  retryAttempt: 0,
  status: 200,
  timezone: 'Asia/Ho_Chi_Minh',
  userEmail: 'member@tuturuuu.com',
  userId: 'user-123',
  userAgent: 'Vitest Browser',
  warning: 'staff-debug-bypass',
  willRetry: false,
};

describe('RateLimitDetailsDialog', () => {
  beforeEach(() => {
    mocks.toastError.mockClear();
    mocks.toastSuccess.mockClear();
    mocks.writeText.mockReset().mockResolvedValue(undefined);

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  it('opens from the rate-limit details event and renders screenshot-friendly diagnostics', async () => {
    render(<RateLimitDetailsDialog />);

    await act(async () => {});
    act(() => {
      window.dispatchEvent(
        new CustomEvent('tuturuuu:rate-limit-details', { detail: details })
      );
    });

    await expect(screen.findByRole('dialog')).resolves.toBeVisible();
    expect(screen.getByText('Rate-limit details')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Request' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Identity' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Limit' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Environment' })).toBeVisible();
    expect(screen.getByText('Debug bypass active')).toBeVisible();
    expect(
      screen.getByText('/api/v1/users/me/profile?token=[redacted]&tab=settings')
    ).toBeVisible();
    expect(screen.getByText('Current IP')).toBeVisible();
    expect(screen.getAllByText('203.0.113.10')[0]).toBeVisible();
    expect(screen.getByText('User ID')).toBeVisible();
    expect(screen.getAllByText('user-123')[0]).toBeVisible();
    expect(screen.getByText('User email')).toBeVisible();
    expect(screen.getAllByText('member@tuturuuu.com')[0]).toBeVisible();
    expect(screen.getByText('Original status')).toBeVisible();
    expect(screen.getAllByText('429')[0]).toBeVisible();
    expect(screen.getAllByText('authenticated')[0]).toBeVisible();
    expect(screen.getAllByText('users-me')[0]).toBeVisible();
    expect(screen.getByText('0/3')).toBeVisible();
    expect(screen.getByText('false')).toBeVisible();
    expect(screen.getByText('Vitest Browser')).toBeVisible();
    expect(screen.getByText('Headers')).toBeVisible();
    expect(screen.queryByText('raw-token')).not.toBeInTheDocument();
  });

  it('copies the sanitized details payload without secrets, cookies, or request bodies', async () => {
    render(<RateLimitDetailsDialog />);

    await act(async () => {});
    act(() => {
      window.dispatchEvent(
        new CustomEvent('tuturuuu:rate-limit-details', { detail: details })
      );
    });

    fireEvent.click(
      await screen.findByRole('button', { name: /copy details/i })
    );

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Rate-limit details copied'
    );

    const copied = mocks.writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain('"responseStatus": 200');
    expect(copied).toContain('"originalStatus": 429');
    expect(copied).toContain('"clientIp": "203.0.113.10"');
    expect(copied).toContain('"userEmail": "member@tuturuuu.com"');
    expect(copied).toContain('"X-Request-Id": "req-123"');
    expect(copied).toContain('token=[redacted]');
    expect(copied).not.toContain('raw-token');
    expect(copied).not.toContain('authorization');
    expect(copied).not.toContain('cookie');
    expect(copied).not.toContain('request-body');
  });
});
