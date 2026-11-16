import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import type { CalendarSourceOption } from '@tuturuuu/internal-api';
import type { CalendarInvitationCapabilities } from '@tuturuuu/internal-api/calendar-invitation-capabilities';
import { useState, type ReactNode } from 'react';
import { useCalendarInvitationCapabilities } from './use-calendar-invitation-capabilities';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalendarEventDetails } from '../components/ui/legacy/calendar/calendar-event-guests';
import { useCalendarDraftSave } from '../components/ui/legacy/calendar/use-calendar-draft-save';
import { eventModalSavePayload } from '../components/ui/legacy/calendar/event-save-payload';
import {
  calendarEventCreatePayload,
  type CalendarEventCreationInput,
} from './calendar-event-create-payload';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  people: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/calendar-invitation-capabilities', () => ({
  getCalendarInvitationCapabilities: api.get,
}));
vi.mock('@tuturuuu/internal-api/people', () => ({
  searchWorkspacePeople: api.people,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const source: CalendarSourceOption = {
  provider: 'microsoft',
  connectionId: 'selected',
  externalCalendarId: 'calendar',
  writable: true,
  id: 'selected',
  label: 'Outlook',
  color: null,
  workspaceCalendarId: null,
  accessRole: 'owner',
  accountName: null,
  accountEmail: 'host@example.invalid',
};
const capability: CalendarInvitationCapabilities = {
  provider: 'microsoft',
  connectionId: 'selected',
  calendarId: 'calendar',
  invitationCreates: true,
};
const requestId = '01900000-0000-7000-8000-000000000001';
const initial: CalendarEventCreationInput = {
  requestId,
  ws_id: 'ws',
  title: 'Meeting',
  location: 'Room',
  description: 'Draft details',
  source: { provider: 'microsoft', connectionId: 'selected' },
  start_at: '2026-11-16T10:00:00Z',
  end_at: '2026-11-16T11:00:00Z',
  invitation: { timeZone: 'UTC', guests: [{ email: 'guest@example.invalid' }] },
};
function Dialog() {
  const [draft, setDraft] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const save = useCalendarDraftSave({
    draft,
    original: { ...initial, id: 'new' },
    wsId: 'ws',
    source,
    buildPayload: () =>
      eventModalSavePayload(draft, { id: 'new' }, draft.source, false),
    addEvent: async (event, options) => {
      const payload = calendarEventCreatePayload(
        event,
        event.start_at,
        event.end_at
      );
      await api.create(payload, options);
      return { ...event, id: 'saved' };
    },
    updateEvent: async () => {
      throw new Error('Unexpected edit');
    },
    closeModal: () => {},
    setIsSaving,
    onError: () => {},
    isSaving,
  });
  return (
    <>
      <CalendarEventDetails
        event={draft}
        onChange={(value) => setDraft({ ...draft, ...value })}
        source={source}
        workspaceId="ws"
        isEditing={false}
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
let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  api.people.mockResolvedValue({
    data: [
      {
        id: 'second',
        kind: 'member',
        displayName: 'Second',
        email: 'second@example.invalid',
        avatarUrl: null,
      },
    ],
  });
  api.get.mockReset().mockResolvedValue(capability);
  api.create.mockReset().mockResolvedValue(undefined);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5);
  });
}
function open() {
  render(
    <QueryClientProvider client={client}>
      <Dialog />
    </QueryClientProvider>
  );
}
it('recovers an expired capability inside the same dialog without losing guests, fields or write identity', async () => {
  open();
  await flush();
  expect(screen.getByRole('button', { name: 'add' })).toBeEnabled();
  expect(api.get).toHaveBeenCalledExactlyOnceWith('ws', source);
  fireEvent.change(screen.getByPlaceholderText('Add location'), {
    target: { value: 'Edited room' },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_001);
  });
  expect(screen.queryByRole('button', { name: 'add' })).toBeNull();
  expect(screen.getByText('guest@example.invalid')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await flush();
  expect(api.create).not.toHaveBeenCalled();
  expect(api.get).toHaveBeenCalledTimes(1); // No polling on expiry.
  let resolve!: (value: CalendarInvitationCapabilities) => void;
  api.get.mockImplementationOnce(
    () =>
      new Promise<CalendarInvitationCapabilities>((done) => {
        resolve = done;
      })
  );
  fireEvent.click(screen.getByRole('button', { name: 'retry' }));
  await flush();
  expect(screen.getByRole('button', { name: 'retry' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await flush();
  expect(api.create).not.toHaveBeenCalled();
  await act(async () => {
    resolve(capability);
  });
  await flush();
  expect(screen.getByRole('button', { name: 'add' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'retry' })).toBeNull();
  expect(screen.getByPlaceholderText('Add location')).toHaveValue(
    'Edited room'
  );
  fireEvent.click(screen.getByRole('button', { name: 'add' }));
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'second' },
  });
  await flush();
  fireEvent.click(screen.getByRole('option', { name: /Second/ }));
  await flush();
  expect(
    screen.getByText('Second <second@example.invalid>')
  ).toBeInTheDocument();

  expect(screen.getByText('guest@example.invalid')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await flush();
  expect(api.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      title: 'Meeting',
      location: 'Edited room',
      description: 'Draft details',
      source: initial.source,
      invitation: {
        timeZone: 'UTC',
        guests: [
          ...initial.invitation!.guests,
          { email: 'second@example.invalid', name: 'Second' },
        ],
      },
    }),
    { requestId }
  );
});
it.each(['failed', 'foreign', 'denied'] as const)(
  'keeps %s refresh closed without discarding the draft or retrying automatically',
  async (state) => {
    open();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_001);
    });
    if (state === 'failed')
      api.get.mockRejectedValueOnce(new Error('Unavailable'));
    else
      api.get.mockResolvedValueOnce(
        state === 'foreign'
          ? { ...capability, calendarId: 'other' }
          : { ...capability, invitationCreates: false }
      );
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await flush();
    expect(screen.queryByRole('button', { name: 'add' })).toBeNull();
    expect(screen.getByText('guest@example.invalid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'retry' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await flush();
    expect(api.create).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(api.get).toHaveBeenCalledTimes(2);
  }
);

it.each(['native', 'read-only'] as const)(
  'does not discover or advertise %s capability',
  async (kind) => {
    const selected: CalendarSourceOption =
      kind === 'native'
        ? {
            provider: 'tuturuuu',
            workspaceCalendarId: 'native',
            writable: true,
            id: 'native',
            label: 'Native',
            color: null,
          }
        : { ...source, writable: false };
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    }
    const { result } = renderHook(
      () => useCalendarInvitationCapabilities('ws', selected),
      { wrapper: Wrapper }
    );
    await flush();
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.capabilities).toBeUndefined();
  }
);
