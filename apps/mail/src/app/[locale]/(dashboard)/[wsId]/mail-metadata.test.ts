// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MailEmailText } from './mail-email-text';
import { MailLabelBadges } from './mail-label-badges';
import {
  MailParticipantAvatar,
  mailParticipantInitials,
} from './mail-participant-avatar';

vi.mock('next-intl', () => ({
  useTranslations: () => (_key: string, values: { count: number }) =>
    `${values.count} tags`,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceMembers: vi.fn(async () => []),
}));
afterEach(cleanup);

it('reveals all collapsed tags on keyboard focus', async () => {
  render(
    h(MailLabelBadges, {
      labels: ['Important', 'Archive', 'Opened', 'Personal'].map((name) => ({
        id: name,
        name,
        color: null,
        aiAutoApply: false,
        aiEnabled: false,
        aiInstructions: '',
        description: '',
        kind: 'custom' as const,
        mailboxId: 'box',
        slug: name.toLowerCase(),
      })),
    })
  );
  const badge = screen.getByText('4 tags');
  expect(badge.tabIndex).toBe(0);
  fireEvent.focus(badge);
  await waitFor(() =>
    expect(screen.getByRole('tooltip').textContent).toContain('Personal')
  );
  for (const name of ['Important', 'Archive', 'Opened'])
    expect(screen.getByRole('tooltip').textContent).toContain(name);
});

it('links addresses while preserving untrusted text as text', () => {
  const { container } = render(
    h(MailEmailText, {
      text: '<script>alert(1)</script> Name <first.last@example.com>, other@example.org',
    })
  );
  expect(container.querySelector('script')).toBeNull();
  expect(
    screen
      .getByRole('link', { name: 'first.last@example.com' })
      .getAttribute('href')
  ).toBe('mailto:first.last@example.com');
  expect(screen.getAllByRole('link')).toHaveLength(2);
});

it('uses names and email local parts for avatar fallbacks', () => {
  expect(mailParticipantInitials('Võ Hoàng Phúc', 'phuc@example.com')).toBe(
    'VP'
  );
  expect(mailParticipantInitials(' ', 'first.last@example.com')).toBe('FL');
  const client = new QueryClient();
  render(
    h(
      QueryClientProvider,
      { client },
      h(MailParticipantAvatar, { address: 'first.last@example.com' })
    )
  );
  expect(screen.getByText('FL')).toBeTruthy();
});
