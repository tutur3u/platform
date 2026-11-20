// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { LiveBlockReason } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../../../../../messages/en.json';
import vi_ from '../../../../../../../../messages/vi.json';
import { formatLiveResetTime, LiveBlockedDialog } from './live-blocked-dialog';

vi.mock('../assistant-visuals', () => ({
  AuroraBlob: () => <div data-testid="live-orb" />,
}));

vi.mock('@/lib/pay-app-url', () => ({
  getPayBillingUrl: (wsId: string) => `https://pay.test/${wsId}/billing`,
}));

const PLANS = ['PLUS', 'PRO', 'ENTERPRISE'];

function renderDialog({
  reason,
  params = {},
  billing = { name: 'Acme Studio', personal: false },
  locale = 'en',
  billingWsId = 'ws-billed',
}: {
  reason: LiveBlockReason;
  params?: Record<string, unknown>;
  billing?: { name: string | null; personal: boolean } | null;
  locale?: 'en' | 'vi';
  billingWsId?: string;
}) {
  const onOpenChange = vi.fn();
  render(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Asia/Ho_Chi_Minh"
      messages={locale === 'en' ? en : vi_}
    >
      <LiveBlockedDialog
        open
        billingWsId={billingWsId}
        onOpenChange={onOpenChange}
        eligibility={{
          eligible: false,
          reason,
          tier: 'FREE',
          billing,
          params: { plans: PLANS, ...params },
        }}
      />
    </NextIntlClientProvider>
  );
  return { onOpenChange };
}

describe('LiveBlockedDialog', () => {
  it('explains plan_required with the paid plans and an Upgrade link', () => {
    const { onOpenChange } = renderDialog({ reason: 'plan_required' });
    expect(
      screen.getByRole('dialog', { name: 'Live is included with paid plans' })
    ).toBeVisible();
    expect(
      screen.getByText('Upgrade to talk with Mira in real time.')
    ).toBeVisible();
    const plans = screen.getByRole('list', { name: 'Plans that include Live' });
    expect(plans).toHaveTextContent('Plus');
    expect(plans).toHaveTextContent('Pro');
    expect(plans).toHaveTextContent('Enterprise');
    expect(screen.getByText('Billed to: Acme Studio')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      'https://pay.test/ws-billed/billing'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the balance and minimum for credits_exhausted with Top up', () => {
    const { onOpenChange } = renderDialog({
      reason: 'credits_exhausted',
      params: { balance: 120, minimumCredits: 500 },
      billing: { name: null, personal: true },
      billingWsId: 'personal-ws',
    });
    expect(
      screen.getByRole('dialog', { name: 'Not enough credits for Live' })
    ).toBeVisible();
    expect(
      screen.getByText(
        'Live needs at least 500 credits to start. You have 120.'
      )
    ).toBeVisible();
    expect(screen.getByText('Billed to: Personal workspace')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Top up' })).toHaveAttribute(
      'href',
      'https://pay.test/personal-ws/billing'
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the local reset time for limit_reached without an upsell', () => {
    const resetAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { onOpenChange } = renderDialog({
      reason: 'limit_reached',
      params: { resetAt },
    });
    expect(
      screen.getByRole('dialog', { name: 'Live limit reached' })
    ).toBeVisible();
    const time = formatLiveResetTime(resetAt, 'en');
    expect(
      screen.getByText(`You can start Live again at ${time}.`)
    ).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Not now' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('falls back to a later message when limit_reached has no reset time', () => {
    renderDialog({ reason: 'limit_reached' });
    expect(screen.getByText('You can start Live again later.')).toBeVisible();
  });

  it('asks for admin access on role_not_allowed', () => {
    const { onOpenChange } = renderDialog({
      reason: 'role_not_allowed',
      billing: null,
    });
    expect(
      screen.getByRole('dialog', {
        name: 'Ask a workspace admin to give you access',
      })
    ).toBeVisible();
    expect(screen.queryByText(/Billed to/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('reports paused without an upsell', () => {
    renderDialog({ reason: 'paused' });
    expect(
      screen.getByRole('dialog', { name: 'Live is temporarily unavailable' })
    ).toBeVisible();
    expect(screen.getByText('Try again in a little while.')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeVisible();
  });

  it('renders Vietnamese copy', () => {
    renderDialog({
      reason: 'credits_exhausted',
      locale: 'vi',
      params: { balance: 0, minimumCredits: 500 },
      billing: { name: null, personal: true },
    });
    expect(
      screen.getByRole('dialog', {
        name: 'Không đủ tín dụng cho chế độ Trực tiếp',
      })
    ).toBeVisible();
    expect(
      screen.getByText('Tính phí vào: Không gian làm việc cá nhân')
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nạp thêm' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Để sau' })).toBeVisible();
  });
});

describe('formatLiveResetTime', () => {
  it('adds the date when the reset is not today', () => {
    const now = new Date('2026-11-20T10:00:00');
    expect(formatLiveResetTime('2026-11-20T15:30:00', 'en', now)).toBe(
      '3:30 PM'
    );
    expect(formatLiveResetTime('2026-11-21T09:05:00', 'en', now)).toMatch(
      /Nov 21.*9:05 AM/
    );
    expect(formatLiveResetTime('not-a-date', 'en', now)).toBeNull();
  });
});
