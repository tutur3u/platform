// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import AccountBadge from './account-badge';

const messages = {
  'meet-together-plan-details': {
    guest_account: 'Guest account',
    tuturuuu_account: 'Tuturuuu account',
  },
};

function show(type: 'GUEST' | 'PLATFORM') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AccountBadge type={type} />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

it('keeps the guest badge', () => {
  show('GUEST');
  expect(screen.getByText('Guest account')).toBeTruthy();
});

it('shows no badge for a Tuturuuu account', () => {
  const { container } = show('PLATFORM');
  expect(container.textContent).toBe('');
  expect(screen.queryByText('Tuturuuu account')).toBeNull();
});
