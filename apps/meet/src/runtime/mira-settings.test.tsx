// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../messages/en.json';
import { MiraSettings } from './mira-settings';

const mocks = vi.hoisted(() => ({ read: vi.fn(), withdraw: vi.fn() }));
vi.mock('@tuturuuu/internal-api/meet-call', () => ({
  readMeetMiraAccountConfirmation: mocks.read,
  withdrawMeetMiraAccountFromSettings: mocks.withdraw,
}));

const accountId = 'synthetic-account';
const copy = messages.meet.mira_consent;

function show(confirmed: boolean) {
  mocks.read.mockResolvedValue({ accountId, confirmed });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <MiraSettings accountId={accountId} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('offers account withdrawal outside a meeting and hides it after success', async () => {
  mocks.withdraw.mockResolvedValue({ ok: true });
  show(true);
  const button = await screen.findByRole('button', {
    name: copy.withdraw_account,
  });
  fireEvent.click(button);
  expect((await screen.findByRole('status')).textContent).toBe(
    copy.withdrawn_account
  );
  expect(mocks.withdraw).toHaveBeenCalledExactlyOnceWith(accountId);
  expect(
    screen.queryByRole('button', { name: copy.withdraw_account })
  ).toBeNull();
});

it('shows the unconfirmed state without an account withdrawal action', async () => {
  show(false);
  expect(await screen.findByText(copy.account_not_confirmed)).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: copy.withdraw_account })
  ).toBeNull();
});
