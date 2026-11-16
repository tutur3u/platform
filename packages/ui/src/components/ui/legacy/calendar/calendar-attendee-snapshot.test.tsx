import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CalendarSourceOption } from '@tuturuuu/internal-api';
import type { CalendarAttendeeSnapshot } from '@tuturuuu/internal-api/calendar-attendees';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CalendarEventDetails } from './calendar-event-guests';
import { eventModalSavePayload } from './event-save-payload';
import { useCalendarDraftSave } from './use-calendar-draft-save';
const api = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/calendar-attendees', () => ({
  getCalendarAttendees: api.get,
}));
vi.mock('@tuturuuu/internal-api/calendar-invitation-capabilities', () => ({
  getCalendarInvitationCapabilities: async () => ({ invitationCreates: false }),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getGoogleCalendarColorOptions: async () => ({ providerColorWrites: false }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const source = {
  provider: 'google',
  connectionId: 'connection',
  externalCalendarId: 'calendar',
  writable: true,
  id: 'source',
  label: 'Calendar',
  color: null,
  workspaceCalendarId: 'local',
  accessRole: 'writer',
  accountName: null,
  accountEmail: 'host@example.invalid',
} satisfies CalendarSourceOption;
const snapshot: CalendarAttendeeSnapshot = {
  eventId: 'saved',
  provider: 'google',
  connectionId: 'connection',
  calendarId: 'calendar',
  revision: 'version',
  attendeeEditing: false,
  attendees: [
    {
      email: 'guest@example.invalid',
      response: 'accepted',
      resource: true,
      optional: false,
    },
  ],
};
function Dialog({ provider }: { provider: 'google' | 'microsoft' }) {
  const original: CalendarEvent = {
    id: 'saved',
    ws_id: 'ws',
    title: 'Title',
    color: 'BLUE',
    location: 'Room',
    start_at: '2026-11-16T10:00:00Z',
    end_at: '2026-11-16T11:00:00Z',
    source: { provider, connectionId: 'connection' },
  };
  const [event, setEvent] = useState(original);
  const save = useCalendarDraftSave({
    draft: event,
    original,
    source: { ...source, provider },
    wsId: 'ws',
    buildPayload: () =>
      eventModalSavePayload(event, original, event.source, false),
    addEvent: api.create,
    updateEvent: api.update,
    closeModal: () => {},
    setIsSaving: () => {},
    onError: () => {},
    isSaving: false,
  });
  return (
    <>
      <CalendarEventDetails
        event={event}
        onChange={(draft) => setEvent({ ...event, ...draft })}
        source={{ ...source, provider }}
        workspaceId="ws"
        isEditing
        timeZone="UTC"
      />
      <button
        type="button"
        onClick={() => {
          void save.save();
        }}
      >
        save
      </button>
    </>
  );
}
function open(provider: 'google' | 'microsoft' = 'google') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Dialog provider={provider} />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  api.get.mockReset().mockResolvedValue(snapshot);
  api.update.mockReset().mockResolvedValue(undefined);
  api.create.mockReset();
});
it.each(['google', 'microsoft'] as const)(
  'reads %s guests only on explicit action without sending attendee edits through modal Save',
  async (provider) => {
    api.get.mockResolvedValue({ ...snapshot, provider });
    open(provider);
    expect(api.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'view' }));
    expect(
      await screen.findByText('guest@example.invalid')
    ).toBeInTheDocument();
    expect(screen.getByText('read_only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'add' })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove/ })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Add location'), {
      target: { value: 'Other room' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledExactlyOnceWith('saved', {
        location: 'Other room',
      })
    );
    expect(api.create).not.toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledExactlyOnceWith('ws', 'saved');
  }
);
it('handles refresh failure and reload using explicit reads, with no provider write or retained guest cache', async () => {
  const first = open();
  fireEvent.click(screen.getByRole('button', { name: 'view' }));
  await screen.findByText('guest@example.invalid');
  api.get.mockRejectedValueOnce(new Error('unknown read'));
  fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
  await screen.findByText('unavailable');
  expect(screen.queryByText('guest@example.invalid')).toBeNull();
  first.unmount();
  open();
  expect(screen.queryByText('guest@example.invalid')).toBeNull();
  expect(api.get).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'view' }));
  await screen.findByText('guest@example.invalid');
  expect(api.get).toHaveBeenCalledTimes(3);
  expect(api.create).not.toHaveBeenCalled();
  expect(api.update).not.toHaveBeenCalled();
});
it.each([
  { provider: 'microsoft' },
  { connectionId: 'foreign' },
  { calendarId: 'foreign' },
  { eventId: 'foreign' },
])('does not display a snapshot with mismatched binding %j', async (change) => {
  api.get.mockResolvedValue({ ...snapshot, ...change });
  open();
  fireEvent.click(screen.getByRole('button', { name: 'view' }));
  await screen.findByText('unavailable');
  expect(screen.queryByText('guest@example.invalid')).toBeNull();
  expect(api.create).not.toHaveBeenCalled();
  expect(api.update).not.toHaveBeenCalled();
});
