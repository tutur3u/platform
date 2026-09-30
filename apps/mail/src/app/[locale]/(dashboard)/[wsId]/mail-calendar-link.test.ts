// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MailActorProvider } from '@/components/mail-actor-provider';
import { createCalendarLinkService } from '@/lib/mail/calendar-link';
import { projectMailCalendarTarget } from '@/lib/mail/calendar-link-adapter';
import { calendarPreviewFixture } from '@/lib/mail/calendar-link-fixture';
import messages from '../../../../../messages/en.json';
import { MailCalendarLink } from './mail-calendar-link';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  unlink: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', async () => ({
  ...(await import('@tuturuuu/internal-api/mail-calendar-link')),
  getMailCalendarLink: api.get,
  previewMailCalendarLink: api.preview,
  confirmMailCalendarLink: api.confirm,
  unlinkMailCalendarLink: api.unlink,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof messages.mail) =>
    messages.mail[key],
}));
const ws = '11111111-1111-4111-8111-111111111111',
  event = '22222222-2222-4222-8222-222222222222';
const url = `https://calendar.tuturuuu.com/en/${ws}?eventId=${event}`;
let client: QueryClient;
beforeEach(async () => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const fixture = calendarPreviewFixture();
  fixture.identity.workspaceId = ws;
  fixture.identity.eventId = event;
  const target = projectMailCalendarTarget(
    'actor',
    ws,
    event,
    fixture,
    'https://calendar.tuturuuu.com'
  );
  if (!target) throw new Error('Invalid synthetic target');
  const service = createCalendarLinkService({
    readInvitation: async () => ({
      uid: 'outlook-uid',
      sequence: 1,
      organizer: 'host@example.test',
      attendee: 'guest@example.test',
      summary: 'Outlook invitation',
      start: '20261002T063000Z',
      when: 'Original time',
      recurrence: null,
      timezone: [],
      location: 'Original Outlook room',
      joinUrl: 'https://meet.google.com/synthetic',
    }),
    readTarget: async () => target,
    readAssociation: async () => null,
    saveAssociation: async () => true,
  });
  const preview = await service.preview({
    actorId: 'actor',
    mailboxId: 'box',
    messageId: 'message',
    workspaceId: ws,
    eventId: event,
  });
  if (!preview) throw new Error('Invalid synthetic preview');
  api.get.mockResolvedValue({ target: null, association: null });
  api.preview.mockResolvedValue({ preview });
  api.confirm.mockResolvedValue({ status: 'linked' });
  api.unlink.mockResolvedValue({ status: 'unlinked' });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function mount() {
  const element = (workspace: string, actor = 'actor') =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MailActorProvider,
        { actorId: actor },
        createElement(MailCalendarLink, {
          workspaceId: workspace,
          mailboxId: 'box',
          messageId: 'message',
        })
      )
    );
  const result = render(element('mail-ws'));
  return {
    ...result,
    switchScope: (workspace: string) => result.rerender(element(workspace)),
    switchActor: (actor: string) => result.rerender(element('mail-ws', actor)),
  };
}
async function preview() {
  fireEvent.change(screen.getByLabelText('Calendar event link'), {
    target: { value: url },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preview link' }));
  await screen.findByRole('button', { name: 'Confirm link' });
}
it('renders both authorities and separate location/join actions; requires explicit confirmation', async () => {
  mount();
  await preview();
  expect(screen.getByText('Original Outlook room')).toBeTruthy();
  expect(
    screen.getByText('Meeting room, Street, City, State, Postal, Country')
  ).toBeTruthy();
  expect(
    screen
      .getAllByRole('link', { name: 'Join meeting' })
      .map((link) => link.getAttribute('href'))
  ).toEqual([
    'https://meet.google.com/synthetic',
    'https://teams.microsoft.com/meet/synthetic',
  ]);
  expect(api.confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('button', { name: 'Confirm link' })).toBeNull();
  expect(api.confirm).not.toHaveBeenCalled();
  await preview();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm link' }));
  await screen.findByText('Calendar event linked');
  expect(api.confirm).toHaveBeenCalledWith(
    'mail-ws',
    'box',
    'message',
    expect.objectContaining({
      calendarWorkspaceId: ws,
      eventId: event,
      receipt: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  );
});
it('disables pending confirmation and reuses the same receipt after network failure for explicit retry', async () => {
  let reject!: (error: Error) => void;
  api.confirm.mockReturnValueOnce(
    new Promise((_resolve, no) => {
      reject = no;
    })
  );
  mount();
  await preview();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm link' }));
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm link' })
        .disabled
    ).toBe(true)
  );
  await act(async () => reject(new Error('Synthetic network failure')));
  await screen.findByText('Unable to update the link. Try again.');
  const first = api.confirm.mock.calls[0]?.[3];
  fireEvent.click(screen.getByRole('button', { name: 'Confirm link' }));
  await screen.findByText('Calendar event linked');
  expect(api.confirm.mock.calls[1]?.[3]).toEqual(first);
});
it('requires fresh preview after authority change and discards old-scope completion after navigation', async () => {
  api.confirm.mockResolvedValueOnce({ status: 'changed' });
  const mounted = mount();
  await preview();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm link' }));
  await screen.findByText('The invitation or event changed. Preview again.');
  expect(screen.queryByRole('button', { name: 'Confirm link' })).toBeNull();
  const value = await api.preview();
  let resolve!: (value: unknown) => void;
  api.preview.mockReturnValueOnce(
    new Promise((yes) => {
      resolve = yes;
    })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Preview link' }));
  await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(3));
  mounted.switchScope('other-ws');
  await act(async () => resolve(value));
  expect(screen.queryByRole('button', { name: 'Confirm link' })).toBeNull();
  expect(
    screen.getByLabelText<HTMLInputElement>('Calendar event link').value
  ).toBe('');
});
it('opens the saved authorized target and unlinks only its association receipt', async () => {
  const value = await api.preview();
  api.get.mockResolvedValue({
    target: value.preview.target,
    association: { receipt: 'saved-receipt' },
  });
  mount();
  await screen.findByRole('link', { name: 'Open linked event' });
  expect(
    screen.getByRole('link', { name: 'Open linked event' }).getAttribute('href')
  ).toBe(`https://calendar.tuturuuu.com/${ws}?eventId=${event}`);
  fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
  await waitFor(() =>
    expect(api.unlink).toHaveBeenCalledWith(
      'mail-ws',
      'box',
      'message',
      'saved-receipt'
    )
  );
  expect(api.confirm).not.toHaveBeenCalled();
});

it('does not reuse an actor-scoped cached target after account change', async () => {
  const value = await api.preview();
  api.get.mockResolvedValueOnce({
    target: value.preview.target,
    association: { receipt: 'old-actor' },
  });
  const mounted = mount();
  await screen.findByRole('link', { name: 'Open linked event' });
  api.get.mockResolvedValue({ target: null, association: null });
  mounted.switchActor('other-actor');
  await waitFor(() =>
    expect(screen.queryByRole('link', { name: 'Open linked event' })).toBeNull()
  );
  expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();
});

it('does not overwrite the confirmed target with a delayed initial link lookup', async () => {
  const value = await api.preview();
  let resolve!: (value: unknown) => void;
  api.get
    .mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        })
    )
    .mockResolvedValue({
      target: value.preview.target,
      association: { receipt: 'new-link' },
    });
  mount();
  await preview();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm link' }));
  await screen.findByRole('link', { name: 'Open linked event' });
  await act(async () => resolve({ target: null, association: null }));
  expect(screen.getByRole('link', { name: 'Open linked event' })).toBeTruthy();
});
it('allows an in-flight confirmation to finish after unmount without navigating or refetching a new scope', async () => {
  let resolve!: (value: unknown) => void;
  api.confirm.mockReturnValueOnce(
    new Promise((yes) => {
      resolve = yes;
    })
  );
  const mounted = mount();
  await preview();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm link' }));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
  mounted.unmount();
  const reads = api.get.mock.calls.length;
  await act(async () => resolve({ status: 'linked' }));
  expect(api.get).toHaveBeenCalledTimes(reads);
});
