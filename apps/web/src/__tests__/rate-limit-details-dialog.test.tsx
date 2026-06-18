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

vi.mock('@tuturuuu/icons', () => ({
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
      'rate_limited_details_fields.captured_at': 'Captured at',
      'rate_limited_details_fields.method': 'Method',
      'rate_limited_details_fields.page': 'Page',
      'rate_limited_details_fields.request': 'Request',
      'rate_limited_details_fields.retry_after': 'Retry after',
      'rate_limited_details_fields.retry_attempt': 'Retry attempt',
      'rate_limited_details_fields.status': 'Status',
      'rate_limited_details_fields.timezone': 'Timezone',
      'rate_limited_details_fields.user_agent': 'User agent',
      'rate_limited_details_fields.will_retry': 'Will retry',
      rate_limited_details_title: 'Rate-limit details',
    };

    return translations[key] ?? key;
  },
}));

const details: RateLimitDebugDetails = {
  capturedAt: '2026-06-18T08:00:00.000Z',
  headers: {
    'CF-Ray': 'ray-123',
    'Retry-After': '7',
    'X-RateLimit-Caller-Class': 'authenticated',
    'X-RateLimit-Limit': '600',
    'X-RateLimit-Policy': 'users-me',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': '1893456000',
    'X-RateLimit-Window': 'minute',
    'X-Request-Id': 'req-123',
  },
  maxRetries: 3,
  method: 'GET',
  pagePath: '/en/settings?tab=rate-limits',
  requestPath: '/api/v1/users/me/profile?token=[redacted]&tab=settings',
  retryAfterSeconds: 7,
  retryAttempt: 1,
  status: 429,
  timezone: 'Asia/Ho_Chi_Minh',
  userAgent: 'Vitest Browser',
  willRetry: true,
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
    expect(screen.getByText('Request')).toBeVisible();
    expect(
      screen.getByText('/api/v1/users/me/profile?token=[redacted]&tab=settings')
    ).toBeVisible();
    expect(screen.getByText('authenticated')).toBeVisible();
    expect(screen.getByText('users-me')).toBeVisible();
    expect(screen.getByText('1/3')).toBeVisible();
    expect(screen.getByText('true')).toBeVisible();
    expect(screen.getByText('Vitest Browser')).toBeVisible();
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
    expect(copied).toContain('"status": 429');
    expect(copied).toContain('"X-Request-Id": "req-123"');
    expect(copied).toContain('token=[redacted]');
    expect(copied).not.toContain('raw-token');
    expect(copied).not.toContain('authorization');
    expect(copied).not.toContain('cookie');
    expect(copied).not.toContain('request-body');
  });
});
