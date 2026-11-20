// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../../../../../messages/en.json';
import vi_ from '../../../../../../../../messages/vi.json';
import type { LiveEntryState } from '@/hooks/use-live-eligibility';
import { LiveStartControl } from './live-start-control';

const blocked: LiveEntryState = {
  status: 'blocked',
  eligibility: {
    eligible: false,
    reason: 'plan_required',
    tier: 'FREE',
    billing: { name: null, personal: true },
    params: { plans: ['PLUS', 'PRO', 'ENTERPRISE'] },
  },
};

function renderControl(entry: LiveEntryState, locale: 'en' | 'vi' = 'en') {
  const onStart = vi.fn();
  render(
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={locale === 'en' ? en : vi_}
    >
      <LiveStartControl entry={entry} onStart={onStart} />
    </NextIntlClientProvider>
  );
  return onStart;
}

describe('LiveStartControl', () => {
  it('shows a visible lock and short reason when blocked', () => {
    const onStart = renderControl(blocked);
    const control = screen.getByRole('button', {
      name: 'Live unavailable: Paid plans only',
    });
    expect(control).toHaveTextContent('Paid plans only');
    expect(control).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(control);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('localizes the blocked reason in Vietnamese', () => {
    renderControl(blocked, 'vi');
    expect(
      screen.getByRole('button', {
        name: 'Chế độ Trực tiếp không khả dụng: Chỉ dành cho gói trả phí',
      })
    ).toBeVisible();
  });

  it('stays disabled with a calm label while checking', () => {
    const onStart = renderControl({ status: 'checking' });
    const control = screen.getByRole('button', {
      name: 'Checking Live access',
    });
    expect(control).toBeDisabled();
    expect(control).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(control);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('starts Live normally when eligible or when the pre-check failed', () => {
    for (const status of ['eligible', 'unknown'] as const) {
      const onStart = renderControl({ status });
      fireEvent.click(screen.getByRole('button', { name: 'Live' }));
      expect(onStart).toHaveBeenCalledOnce();
      cleanup();
    }
  });
});
