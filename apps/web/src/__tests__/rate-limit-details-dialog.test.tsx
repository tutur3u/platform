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
  submitRateLimitAppeal: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  unblockBlockedIp: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button onClick={() => onSuccess('captcha-token')} type="button">
      Turnstile
    </button>
  ),
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
  Loader2: (props: Record<string, unknown>) => (
    <span aria-hidden="true" {...props}>
      loading
    </span>
  ),
  Shield: (props: Record<string, unknown>) => (
    <span aria-hidden="true" {...props}>
      shield
    </span>
  ),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  submitRateLimitAppeal: mocks.submitRateLimitAppeal,
}));

vi.mock('@tuturuuu/internal-api/infrastructure', () => ({
  unblockBlockedIp: mocks.unblockBlockedIp,
}));

vi.mock('@tuturuuu/turnstile/client', () => ({
  resolveTurnstileClientState: () => ({
    canRenderWidget: true,
    isRequired: true,
    siteKey: 'site-key',
  }),
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
  DialogFooter: ({
    children,
    ...props
  }: HTMLAttributes<HTMLElement> & { children: ReactNode }) => (
    <footer {...props}>{children}</footer>
  ),
  DialogHeader: ({
    children,
    ...props
  }: HTMLAttributes<HTMLElement> & { children: ReactNode }) => (
    <header {...props}>{children}</header>
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
      rate_limited_clear_ip_block: 'Clear IP block',
      rate_limited_clear_ip_block_failed: 'Failed to clear IP block',
      rate_limited_clear_ip_block_failed_description:
        'The IP block could not be cleared.',
      rate_limited_clear_ip_block_loading: 'Clearing...',
      rate_limited_clear_ip_block_success: 'IP block cleared',
      rate_limited_appeal_description:
        'Ask admins to review this block and grant short temporary access while they investigate.',
      rate_limited_appeal_failed: 'Failed to submit review request',
      rate_limited_appeal_failed_description:
        'The review request could not be submitted.',
      rate_limited_appeal_message_label: 'Context',
      rate_limited_appeal_message_placeholder:
        'Tell admins why this traffic is legitimate',
      rate_limited_appeal_review_state:
        'Review requested. Temporary access expires at {expiresAt}.',
      rate_limited_appeal_submit: 'Request review',
      rate_limited_appeal_submitting: 'Requesting...',
      rate_limited_appeal_success: 'Review request submitted',
      rate_limited_appeal_title: 'Request admin review',
      rate_limited_appeal_turnstile_failed: 'Verification failed',
      rate_limited_appeal_turnstile_not_configured:
        'Turnstile is not configured.',
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
    'X-Proxy-Block-Reason': 'ip-already-blocked',
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
    mocks.submitRateLimitAppeal.mockReset().mockResolvedValue({
      appeal: { id: 'appeal-1' },
      coalesced: false,
      temporaryReliefExpiresAt: '2026-06-18T08:15:00.000Z',
    });
    mocks.unblockBlockedIp.mockReset().mockResolvedValue({
      message: 'IP unblocked successfully',
    });
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

  it('keeps the diagnostic body scrollable inside a fixed header/footer dialog', async () => {
    render(<RateLimitDetailsDialog />);

    await act(async () => {});
    act(() => {
      window.dispatchEvent(
        new CustomEvent('tuturuuu:rate-limit-details', { detail: details })
      );
    });

    const dialog = await screen.findByRole('dialog');
    const content = dialog.firstElementChild;
    const scrollArea = content?.children.item(1);

    expect(content).toHaveClass(
      'grid-rows-[auto_minmax(0,1fr)_auto]',
      'overflow-hidden'
    );
    expect(scrollArea).toHaveClass(
      'min-h-0',
      'overflow-y-auto',
      'overscroll-contain'
    );
  });

  it('allows staff diagnostics to clear an already-blocked IP', async () => {
    render(<RateLimitDetailsDialog />);

    await act(async () => {});
    act(() => {
      window.dispatchEvent(
        new CustomEvent('tuturuuu:rate-limit-details', { detail: details })
      );
    });

    fireEvent.click(
      await screen.findByRole('button', { name: /clear ip block/i })
    );

    await waitFor(() =>
      expect(mocks.unblockBlockedIp).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '203.0.113.10',
          reason: expect.stringContaining('ip-already-blocked'),
        })
      )
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('IP block cleared', {
      description: '203.0.113.10',
    });
  });

  it('does not show the clear action for non-staff diagnostics', async () => {
    render(<RateLimitDetailsDialog />);

    await act(async () => {});
    act(() => {
      window.dispatchEvent(
        new CustomEvent('tuturuuu:rate-limit-details', {
          detail: {
            ...details,
            debugBypass: undefined,
            userEmail: 'member@example.com',
          },
        })
      );
    });

    await expect(screen.findByRole('dialog')).resolves.toBeVisible();
    expect(
      screen.queryByRole('button', { name: /clear ip block/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /request review/i })
    ).toBeVisible();
  });

  it('submits a non-staff rate-limit appeal with sanitized diagnostics and Turnstile', async () => {
    render(<RateLimitDetailsDialog />);

    await act(async () => {});
    act(() => {
      window.dispatchEvent(
        new CustomEvent('tuturuuu:rate-limit-details', {
          detail: {
            ...details,
            debugBypass: undefined,
            userEmail: 'member@example.com',
          },
        })
      );
    });

    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Context'), {
      target: { value: 'This is a classroom attendance session.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Turnstile' }));
    fireEvent.click(screen.getByRole('button', { name: /request review/i }));

    await waitFor(() =>
      expect(mocks.submitRateLimitAppeal).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'This is a classroom attendance session.',
          turnstileToken: 'captcha-token',
        })
      )
    );

    const payload = mocks.submitRateLimitAppeal.mock.calls[0]?.[0] as {
      diagnostics: {
        identity: { clientIp: string; userEmail: string };
        request: { requestPath: string };
      };
    };
    expect(payload.diagnostics.identity.clientIp).toBe('203.0.113.10');
    expect(payload.diagnostics.identity.userEmail).toBe('member@example.com');
    expect(payload.diagnostics.request.requestPath).toContain('[redacted]');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Review request submitted');
    expect(
      screen.getByText(/Review requested. Temporary access expires at/i)
    ).toBeVisible();
  });

  it('renders the server-observed IP for auth rate-limit diagnostics', async () => {
    render(<RateLimitDetailsDialog />);

    await act(async () => {});
    act(() => {
      window.dispatchEvent(
        new CustomEvent('tuturuuu:rate-limit-details', {
          detail: {
            ...details,
            clientIp: '198.51.100.25',
            debugBypass: undefined,
            headers: {
              'Retry-After': '12',
              'X-RateLimit-Caller-Class': 'anonymous',
              'X-RateLimit-Client-IP': '198.51.100.25',
              'X-RateLimit-Policy': 'otp-send',
            },
            method: 'POST',
            rateLimitStatus: undefined,
            requestPath: '/api/v1/auth/otp/send',
            retryAfterSeconds: 12,
            status: 429,
            userEmail: undefined,
            userId: undefined,
            warning: undefined,
            willRetry: false,
          },
        })
      );
    });

    await expect(screen.findByRole('dialog')).resolves.toBeVisible();
    expect(screen.getByText('Current IP')).toBeVisible();
    expect(screen.getAllByText('198.51.100.25')[0]).toBeVisible();
    expect(screen.getByText('/api/v1/auth/otp/send')).toBeVisible();
    expect(screen.getAllByText('otp-send')[0]).toBeVisible();
    expect(screen.getAllByText('anonymous')[0]).toBeVisible();
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
