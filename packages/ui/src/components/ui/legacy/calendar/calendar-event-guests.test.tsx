import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CalendarSourceOption } from '@tuturuuu/internal-api';
import type { CalendarInvitationCapabilities } from '@tuturuuu/internal-api/calendar-invitation-capabilities';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalendarEventDetails } from './calendar-event-guests';

const api = vi.hoisted(() => ({ get: vi.fn(), people: vi.fn() }));
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
afterEach(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  api.get.mockReset();
  api.people.mockReset().mockResolvedValue({
    data: [
      {
        id: 'guest',
        kind: 'member',
        email: '  Guest@Example.invalid ',
        displayName: 'Guest',
        avatarUrl: null,
      },
      {
        id: 'hidden',
        kind: 'member',
        email: null,
        displayName: 'Hidden email',
        avatarUrl: null,
      },
    ],
  });
});
it.each(['google', 'microsoft'] as const)(
  'requires explicit selection and normalizes %s guest payload with hidden-email refusal',
  async (provider) => {
    api.get.mockResolvedValue({ ...capability, provider });
    const onChange = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={client}>
        <CalendarEventDetails
          event={{ title: 'Meeting' }}
          onChange={onChange}
          source={{ ...source, provider }}
          workspaceId="ws"
          isEditing={false}
          timeZone="Asia/Ho_Chi_Minh"
        />
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'add' }));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'guest' },
    });
    const guest = await screen.findByRole('option', { name: /Guest/ });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Hidden email')).toBeNull();
    fireEvent.click(guest);
    expect(onChange).toHaveBeenCalledWith({
      title: 'Meeting',
      invitation: {
        timeZone: 'Asia/Ho_Chi_Minh',
        guests: [{ email: 'guest@example.invalid', name: 'Guest' }],
      },
    });
  }
);
it('hides guest selection without matching capability and for saved events', async () => {
  api.get
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce({ ...capability, connectionId: 'foreign' });
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  const props = {
    event: {},
    onChange: vi.fn(),
    source,
    workspaceId: 'ws',
    isEditing: false,
    timeZone: 'UTC',
  };
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <CalendarEventDetails {...props} />
    </QueryClientProvider>
  );
  const retry = await screen.findByRole('button', { name: 'retry' });
  // Wait for the failed external read before requesting a fresh result.
  await vi.waitFor(() => expect(retry).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'add' })).toBeNull();
  fireEvent.click(retry);
  await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(retry).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'add' })).toBeNull();
  rerender(
    <QueryClientProvider client={client}>
      <CalendarEventDetails {...props} isEditing />
    </QueryClientProvider>
  );
  expect(screen.queryByRole('button', { name: 'add' })).toBeNull();
});
