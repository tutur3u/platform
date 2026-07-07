import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InternalAppAccountConfirmation } from './internal-app-account-confirmation';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key} ${Object.values(values).join(' ')}` : key,
}));

const noop = () => {};

const baseProps = {
  accounts: [],
  activeAccountId: 'user-1',
  appName: 'Hive',
  confirming: false,
  currentUserId: 'user-1',
  isAccountSwitcherReady: true,
  onContinue: noop,
  onRetryProfile: noop,
  onSwitchAccount: noop,
  onUseAnotherAccount: noop,
  switchingAccountId: null,
};

describe('InternalAppAccountConfirmation', () => {
  it('does not render auth fallback identity while profile is loading', () => {
    render(
      <InternalAppAccountConfirmation
        {...baseProps}
        currentDisplayName="Auth Metadata Name"
        currentEmail="auth@example.com"
        profileState="loading"
      />
    );

    expect(
      screen.getByText('login.loading_account_profile_title')
    ).toBeTruthy();
    expect(screen.queryByText('Auth Metadata Name')).toBeNull();
    expect(screen.queryByText('auth@example.com')).toBeNull();
  });

  it('renders the loaded public profile identity and private email', () => {
    render(
      <InternalAppAccountConfirmation
        {...baseProps}
        currentDisplayName="Public Profile Name"
        currentEmail="private@example.com"
        profileState="ready"
      />
    );

    expect(screen.getAllByText('Public Profile Name').length).toBeGreaterThan(
      0
    );
    expect(screen.getByText('private@example.com')).toBeTruthy();
    expect(screen.queryByText('auth@example.com')).toBeNull();
  });
});
