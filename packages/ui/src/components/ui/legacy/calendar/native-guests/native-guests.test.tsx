import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PendingGuest } from './guest-adder';
import { NativeEventGuests } from './native-event-guests';
import {
  PendingGuestsProvider,
  PendingNativeGuests,
} from './pending-native-guests';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  people: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/calendar-guests', () => ({
  getCalendarEventGuests: api.get,
  addCalendarEventGuests: api.add,
  removeCalendarEventGuest: api.remove,
  updateCalendarEventGuest: vi.fn(),
  updateCalendarGuestSettings: vi.fn(),
  notifyCalendarEventGuests: vi.fn(),
  linkCalendarEventMeeting: vi.fn(),
  unlinkCalendarEventMeeting: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/people', () => ({
  searchWorkspacePeople: api.people,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  for (const mock of Object.values(api)) mock.mockReset();
  api.people.mockResolvedValue({ data: [] });
});
afterEach(() => vi.unstubAllGlobals());

function withQuery(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function PendingHarness({
  onChange,
}: {
  onChange: (guests: PendingGuest[]) => void;
}) {
  const [guests, setGuests] = useState<PendingGuest[]>([]);
  const [addMeet, setAddMeet] = useState(false);
  onChange(guests);
  return (
    <PendingGuestsProvider value={{ guests, setGuests, addMeet, setAddMeet }}>
      <PendingNativeGuests workspaceId="ws" />
    </PendingGuestsProvider>
  );
}

it('collects pending guests by email, normalised and without duplicates', () => {
  let latest: PendingGuest[] = [];
  render(
    withQuery(<PendingHarness onChange={(guests) => (latest = guests)} />)
  );
  const input = screen.getByLabelText('email_label');
  fireEvent.change(input, { target: { value: ' Friend@Example.com ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.change(input, { target: { value: 'friend@example.com' } });
  expect(screen.getByRole('button', { name: 'add_email' })).toBeDisabled();
  expect(latest.map((guest) => guest.input)).toEqual([
    { source: 'email', email: 'friend@example.com' },
  ]);
  fireEvent.click(
    screen.getByRole('button', { name: 'remove:{"name":"friend@example.com"}' })
  );
  expect(latest).toEqual([]);
});

it('shows saved guests with RSVP state and invites new ones', async () => {
  api.get.mockResolvedValue({
    native: true,
    links: {
      meeting: { id: 'm', url: 'https://tuturuuu.com/meet/ws/meetings/m' },
      task: null,
    },
    settings: null,
    guests: [
      {
        id: 'g1',
        email: 'owner@example.com',
        displayName: 'Owner',
        userId: 'u',
        contactId: null,
        source: 'member',
        isOrganizer: true,
        isOptional: false,
        rsvpStatus: 'accepted',
        respondedAt: null,
        invited: false,
      },
      {
        id: 'g2',
        email: 'guest@example.com',
        displayName: null,
        userId: null,
        contactId: null,
        source: 'email',
        isOrganizer: false,
        isOptional: false,
        rsvpStatus: 'tentative',
        respondedAt: null,
        invited: true,
      },
    ],
  });
  api.add.mockResolvedValue({ added: 1, delivery: null });
  render(
    withQuery(<NativeEventGuests workspaceId="ws" eventId="e" timeZone="UTC" />)
  );

  expect(await screen.findByText('organizer')).toBeInTheDocument();
  expect(screen.getByText('rsvp_tentative')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'meet_join' })).toHaveAttribute(
    'href',
    'https://tuturuuu.com/meet/ws/meetings/m'
  );
  expect(
    screen.getByRole('button', { name: 'send_update' })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'remove:{"name":"Owner"}' })
  ).toBeNull();

  const input = screen.getByLabelText('email_label');
  fireEvent.change(input, { target: { value: 'new@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'add_email' }));
  await waitFor(() =>
    expect(api.add).toHaveBeenCalledWith('ws', 'e', {
      guests: [{ source: 'email', email: 'new@example.com' }],
      notify: true,
      display: { timeZone: 'UTC', allDay: undefined },
    })
  );
});
