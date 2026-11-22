// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TurnstilePill } from './turnstile-pill';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function widgetSlot() {
  return document.querySelector('[data-turnstile-widget]');
}

describe('TurnstilePill', () => {
  it.each([
    ['checking', 'login.turnstile_checking'],
    ['passed', 'login.turnstile_passed'],
    ['failed', 'login.turnstile_failed'],
    ['unavailable', 'login.turnstile_unavailable'],
  ] as const)('labels the %s state quietly', (state, label) => {
    render(
      <TurnstilePill state={state}>
        <div data-testid="widget" />
      </TurnstilePill>
    );
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it('folds the widget away only while a token is held', () => {
    const { rerender } = render(
      <TurnstilePill state="checking">
        <div data-testid="widget" />
      </TurnstilePill>
    );
    expect(widgetSlot()).not.toHaveAttribute('inert');

    rerender(
      <TurnstilePill state="passed">
        <div data-testid="widget" />
      </TurnstilePill>
    );
    // Still mounted, so Cloudflare keeps its token handling and refresh.
    expect(screen.getByTestId('widget')).toBeInTheDocument();
    expect(widgetSlot()).toHaveAttribute('inert');

    rerender(
      <TurnstilePill state="checking">
        <div data-testid="widget" />
      </TurnstilePill>
    );
    expect(widgetSlot()).not.toHaveAttribute('inert');
  });

  it('offers a retry and the existing error copy when the check fails', () => {
    const onRetry = vi.fn();
    render(
      <TurnstilePill
        detail="login.captcha_error"
        onRetry={onRetry}
        state="failed"
      >
        <div data-testid="widget" />
      </TurnstilePill>
    );
    expect(screen.getByText('login.captcha_error')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'login.turnstile_retry' })
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('exposes the failure detail by id for blocked controls', () => {
    render(
      <TurnstilePill
        detail="captcha failed"
        detailId="turnstile-detail"
        state="failed"
      />
    );
    expect(document.getElementById('turnstile-detail')).toHaveTextContent(
      'captcha failed'
    );
  });
});
