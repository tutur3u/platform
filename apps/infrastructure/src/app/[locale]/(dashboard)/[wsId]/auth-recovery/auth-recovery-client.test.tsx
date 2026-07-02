import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRecoveryClient } from './auth-recovery-client';

const mocks = vi.hoisted(() => ({
  createAuthRecoveryOverride: vi.fn(),
  getAuthRecoverySnapshot: vi.fn(),
  revokeAuthRecoveryOverride: vi.fn(),
  sendAuthRecoveryEmail: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const translations: Record<string, string> = {
  'actions.create': 'Create override',
  'actions.retry': 'Retry',
  'actions.revoke': 'Revoke',
  'actions.search': 'Search',
  'actions.send_email': 'Send recovery email',
  'common.no': 'No',
  'common.yes': 'Yes',
  'create.description': 'Create recovery access.',
  'create.title': 'Create recovery override',
  'diagnostics.active_override': 'Active override',
  'diagnostics.auth_user': 'Auth user',
  'diagnostics.email_blocked': 'Email blocked',
  'diagnostics.recent_abuse_events': 'Recent abuse events',
  'diagnostics.related_ip_block_expires': 'Expires: {value}',
  'diagnostics.related_ip_block_reason': 'Reason: {value}',
  'diagnostics.related_ip_blocks': 'Active related IP blocks',
  'empty.events': 'No recovery events found.',
  'empty.overrides': 'No recovery overrides match this filter.',
  'error.description': 'Something went wrong.',
  'error.title': 'Failed to load auth recovery',
  'fields.allow_normal_login': 'Allow normal login bypass',
  'fields.allow_recovery_email': 'Allow recovery email login',
  'fields.email': 'Email address',
  'fields.reason': 'Support reason',
  'fields.reason_placeholder': 'What was verified?',
  'fields.reset_otp_attempts': 'Reset OTP verify attempts',
  'fields.reset_otp_send': 'Reset OTP send limits',
  'fields.revoke_reason': 'Revoke reason',
  'fields.revoke_reason_placeholder': 'Optional note for audit',
  'fields.unblock_related_ips': 'Unblock related IPs',
  'filters.email': 'Email diagnostics',
  'filters.email_placeholder': 'person@example.com',
  'sections.events': 'Events',
  'sections.overrides': 'Overrides',
  'toasts.create_failed': 'Failed to create override',
  'toasts.created': 'Created',
  'toasts.revoke_failed': 'Failed to revoke override',
  'toasts.revoked': 'Revoked',
  'toasts.send_failed': 'Failed to send email',
  'toasts.sent': 'Sent',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    let message = translations[key] ?? key;
    if (values) {
      for (const [name, value] of Object.entries(values)) {
        message = message.replace(`{${name}}`, value);
      }
    }
    return message;
  },
}));

vi.mock('@tuturuuu/icons', () => ({
  Loader2: (props: Record<string, unknown>) => (
    <span aria-hidden="true" {...props} />
  ),
  Search: (props: Record<string, unknown>) => (
    <span aria-hidden="true" {...props} />
  ),
  ShieldCheck: (props: Record<string, unknown>) => (
    <span aria-hidden="true" {...props} />
  ),
}));

vi.mock('@tuturuuu/internal-api/infrastructure', () => ({
  createAuthRecoveryOverride: (
    ...args: Parameters<typeof mocks.createAuthRecoveryOverride>
  ) => mocks.createAuthRecoveryOverride(...args),
  getAuthRecoverySnapshot: (
    ...args: Parameters<typeof mocks.getAuthRecoverySnapshot>
  ) => mocks.getAuthRecoverySnapshot(...args),
  revokeAuthRecoveryOverride: (
    ...args: Parameters<typeof mocks.revokeAuthRecoveryOverride>
  ) => mocks.revokeAuthRecoveryOverride(...args),
  sendAuthRecoveryEmail: (
    ...args: Parameters<typeof mocks.sendAuthRecoveryEmail>
  ) => mocks.sendAuthRecoveryEmail(...args),
}));

vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
  }) => <button {...props}>{children}</button>,
}));

vi.mock('@tuturuuu/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
      type="checkbox"
    />
  ),
}));

vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@tuturuuu/ui/label', () => ({
  Label: ({
    children,
    ...props
  }: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) => (
    <label {...props}>{children}</label>
  ),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('@tuturuuu/ui/textarea', () => ({
  Textarea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

function renderClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthRecoveryClient canManage locale="en" />
    </QueryClientProvider>
  );
}

describe('AuthRecoveryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthRecoverySnapshot.mockResolvedValue({
      diagnostics: {
        activeOverride: null,
        authUser: null,
        emailBlocked: false,
        emailBlockedReason: null,
        recentAbuseEvents: [],
        relatedIpBlocks: [
          {
            blockLevel: 2,
            blockedAt: '2026-06-29T10:00:00.000Z',
            expiresAt: '2026-06-29T11:00:00.000Z',
            id: 'block-1',
            ipAddress: '203.0.113.88',
            reason: 'otp_send',
            status: 'active',
          },
        ],
      },
      events: [],
      overrides: [],
    });
    mocks.createAuthRecoveryOverride.mockResolvedValue({
      override: { email: 'person@example.com', id: 'override-1' },
    });
  });

  it('surfaces active related IP blocks and defaults unblock related IPs on', async () => {
    renderClient();

    expect(await screen.findByText('203.0.113.88')).toBeVisible();
    expect(screen.getByText('Reason: otp_send')).toBeVisible();
    const unblockRelatedIps = screen.getByLabelText(
      'Unblock related IPs'
    ) as HTMLInputElement;
    await waitFor(() => expect(unblockRelatedIps).toBeChecked());

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Support reason'), {
      target: { value: 'Support reviewed the block' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create override' }));

    await waitFor(() =>
      expect(mocks.createAuthRecoveryOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          clearRelatedIpBlocks: true,
          email: 'person@example.com',
          reason: 'Support reviewed the block',
        })
      )
    );
  });
});
