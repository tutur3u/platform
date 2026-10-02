// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../messages/en.json';
import { MailInvitationCard } from './mail-invitation-card';

const api = vi.hoisted(() => ({ get: vi.fn(), respond: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  getMailCalendarLink: vi.fn(async () => ({ target: null, association: null })),
  getMailInvitation: api.get,
  respondToMailInvitation: api.respond,
}));
vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: keyof typeof messages.mail, values?: Record<string, string>) =>
      Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, value),
        messages.mail[key]
      ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount(invitation: unknown) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(['mail', 'ws', 'box', 'invitation', 'message'], {
    invitation,
  });
  api.get.mockResolvedValue({ invitation });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MailInvitationCard, {
        workspaceId: 'ws',
        mailboxId: 'box',
        messageId: 'message',
      })
    )
  );
}
const invitation = {
  summary: 'Supervisors',
  attendee: 'guest@example.test',
  organizer: 'host@example.test',
  when: '2026-10-02 13:30 (SE Asia Standard Time)',
  location: 'Original room',
  joinUrl: 'https://teams.microsoft.com/meet/synthetic',
  reply: null,
};

it('renders actual RSVP controls with original identity, location and separate join link', () => {
  mount(invitation);
  expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Tentative' })).toBeTruthy();
  expect(
    screen.getByText(
      'Reply as guest@example.test to organizer host@example.test'
    )
  ).toBeTruthy();
  expect(screen.getByText('Location: Original room')).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Join meeting' }).getAttribute('href')
  ).toBe(invitation.joinUrl);
  expect(api.respond).not.toHaveBeenCalled();
});
it('renders no controls for ordinary ICS, uninvited identity or viewer permission result', () => {
  mount(null);
  expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  expect(api.respond).not.toHaveBeenCalled();
});
it('keeps the same request identity when retrying an uncertain response and disables duplicate successful response', async () => {
  api.respond
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValue({ status: 'sent' });
  mount(invitation);
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  await waitFor(() => expect(api.respond).toHaveBeenCalledTimes(1));
  await screen.findByText(
    'Could not confirm your response. Retry the same response to check its status.'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  await screen.findByText('Response sent: Accept');
  expect(api.respond.mock.calls[0]?.[3]).toEqual(
    api.respond.mock.calls[1]?.[3]
  );
  expect(api.respond.mock.calls[0]?.[3]).not.toHaveProperty('scope');
  expect(
    (screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
});
it('reflects saved response state after reopening without sending another reply', () => {
  mount({ ...invitation, reply: { response: 'TENTATIVE', status: 'sent' } });
  expect(screen.getByText('Response sent: Tentative')).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Tentative' }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  expect(api.respond).not.toHaveBeenCalled();
});
it('keeps the authoritative current response when checking a completed historical replay', async () => {
  api.respond.mockResolvedValue({ status: 'sent', response: 'DECLINED' });
  mount(invitation);
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  await screen.findByText('Response sent: Decline');
  expect(
    (screen.getByRole('button', { name: 'Decline' }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement)
      .disabled
  ).toBe(false);
});
