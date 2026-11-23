import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusedContinueStep } from './focused-continue-step';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

afterEach(cleanup);

function renderStep(accountLink: boolean, onContinue = vi.fn()) {
  render(
    <FocusedContinueStep
      accountLink={accountLink}
      appName="Upskii"
      autoContinue={false}
      busy={false}
      canContinue
      continuing={false}
      onContinue={onContinue}
      onUseAnotherAccount={vi.fn()}
      session={{ avatarUrl: null, name: 'Ada' }}
    />
  );
  return onContinue;
}

describe('FocusedContinueStep account link', () => {
  it('names the link before the user continues', () => {
    const onContinue = renderStep(true);
    expect(screen.getByText('login.account_link_notice:Upskii')).toBeDefined();
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /continue_as/ }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'login.use_another_account' })
    ).toBeDefined();
  });

  it('shows no link notice for a sign-in', () => {
    renderStep(false);
    expect(screen.queryByText(/account_link_notice/)).toBeNull();
  });
});
