// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: { count: number; total: number }) =>
      values ? `${values.count} of ${values.total} blacklisted` : key,
}));

import { MailBlacklistStatus } from './mail-blacklist-status';

afterEach(cleanup);
it('shows the blocked reason directly without opening a form', () => {
  render(
    createElement(MailBlacklistStatus, {
      recipients: [
        {
          email: 'failed@example.com',
          blocked: true,
          reason: 'Inactive/Abandoned',
        },
      ],
    })
  );
  expect(
    screen.getByText('blacklisted · blacklist_reason_inactive')
  ).toBeTruthy();
});
it('makes partial blacklist state explicit in compact lists', () => {
  render(
    createElement(MailBlacklistStatus, {
      compact: true,
      recipients: [
        { email: 'blocked@example.com', blocked: true },
        { email: 'active@example.com', blocked: false },
      ],
    })
  );
  expect(screen.getByText('1 of 2 blacklisted')).toBeTruthy();
});
it('does not label unblocked or unknown recipients as blacklisted', () => {
  const { container } = render(
    createElement(MailBlacklistStatus, {
      recipients: [{ email: 'active@example.com', blocked: false }],
    })
  );
  expect(container.textContent).toBe('');
});
