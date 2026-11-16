import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { expect, it, vi } from 'vitest';
import { useCalendarDraftSave } from './use-calendar-draft-save';

const invitationQuery = vi.hoisted(() => ({
  data: undefined as
    | import('@tuturuuu/internal-api/calendar-invitation-capabilities').CalendarInvitationCapabilities
    | undefined,
}));
vi.mock('@tuturuuu/internal-api/calendar-invitation-capabilities', () => ({
  getCalendarInvitationCapabilities: async () => invitationQuery.data,
}));

const query = vi.hoisted(() => ({
  data: { connectionId: 'owned', providerColorWrites: true },
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getGoogleCalendarColorOptions: async () => query.data,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

function fixture() {
  query.data = { connectionId: 'owned', providerColorWrites: true };
  const draft = {
    requestId: '01900000-0000-7000-8000-000000000001',
    ws_id: 'workspace',
    title: 'Original',
  };
  const args = {
    draft,
    wsId: 'workspace',
    source: { provider: 'google' as const, connectionId: 'owned' } as any,
    original: { id: 'new' } as CalendarEvent,
    buildPayload: () => ({ title: args.draft.title }),
    addEvent: vi.fn().mockRejectedValueOnce(new Error('lost response')),
    updateEvent: vi.fn().mockResolvedValue(undefined),
    closeModal: vi.fn(),
    setIsSaving: vi.fn(),
    onError: vi.fn(),
    isSaving: false,
  };
  return args;
}

async function mount(args: Parameters<typeof useCalendarDraftSave>[0]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  const result = renderHook(() => useCalendarDraftSave(args), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  return result;
}

it('retries immutable uncertain contents and ID, preserves edits, then explicitly updates the confirmed ID', async () => {
  const args = fixture();
  const { result, rerender } = await mount(args);
  await act(() => result.current.save());
  expect(result.current.recoveryNotice).not.toBeNull();
  args.draft = { ...args.draft, title: 'Edited after uncertainty' };
  rerender();
  await act(() => result.current.save());
  expect(args.addEvent).toHaveBeenCalledTimes(1);
  args.addEvent.mockResolvedValueOnce({ id: 'confirmed', title: 'Original' });
  const retry = (result.current.recoveryNotice!.props.children[1] as any).props
    .onClick;
  await act(() => retry());
  expect(args.addEvent).toHaveBeenLastCalledWith(
    { title: 'Original' },
    { requestId: args.draft.requestId }
  );
  expect(args.closeModal).not.toHaveBeenCalled();
  expect(args.draft.title).toBe('Edited after uncertainty');
  await act(() => result.current.save());
  expect(args.addEvent).toHaveBeenCalledTimes(2);
  expect(args.updateEvent).toHaveBeenCalledWith('confirmed', {
    title: 'Edited after uncertainty',
  });
  expect(args.closeModal).toHaveBeenCalledTimes(1);
});

it('keeps failed recovery uncertain without dispatching edited intent', async () => {
  const args = fixture();
  const { result } = await mount(args);
  await act(() => result.current.save());
  args.addEvent.mockRejectedValueOnce(new Error('still uncertain'));
  const retry = (result.current.recoveryNotice!.props.children[1] as any).props
    .onClick;
  await act(() => retry());
  expect(result.current.recoveryNotice).not.toBeNull();
  expect(args.updateEvent).not.toHaveBeenCalled();
  expect(args.closeModal).not.toHaveBeenCalled();
});

it('does not close or recover another draft after a stale retry response', async () => {
  const args = fixture();
  const { result, rerender } = await mount(args);
  await act(() => result.current.save());
  let resolve!: (event: unknown) => void;
  args.addEvent.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    })
  );
  const retry = (result.current.recoveryNotice!.props.children[1] as any).props
    .onClick;
  let pending!: Promise<void>;
  act(() => {
    pending = retry();
  });
  args.draft = {
    ...args.draft,
    requestId: 'another-draft',
    title: 'New draft',
  };
  rerender();
  await act(async () => {
    resolve({ id: 'old-confirmed', title: 'Original' });
    await pending;
  });
  expect(args.closeModal).not.toHaveBeenCalled();
  expect(result.current.recoveryNotice).toBeNull();
  expect(args.updateEvent).not.toHaveBeenCalled();
});

it('keeps legacy unconfirmed creates out of automatic retry', async () => {
  const args = fixture();
  query.data.providerColorWrites = false;
  const { result } = await mount(args);
  await act(() => result.current.save());
  expect(result.current.recoveryNotice!.props.children[1]).toBe(false);
  await act(() => result.current.save());
  expect(args.addEvent).toHaveBeenCalledTimes(1);
  expect(args.updateEvent).not.toHaveBeenCalled();
});

it('saves Outlook guests with original creation identity and recovers immutable intent', async () => {
  const args = fixture();
  args.source = {
    ...args.source,
    provider: 'microsoft',
    externalCalendarId: 'calendar',
    writable: true,
    accountEmail: 'host@example.invalid',
  };
  invitationQuery.data = {
    provider: 'microsoft',
    connectionId: 'owned',
    calendarId: 'calendar',
    invitationCreates: true,
  };
  const payload = {
    title: 'Original',
    source: { provider: 'microsoft' as const, connectionId: 'owned' },
    invitation: {
      timeZone: 'Asia/Ho_Chi_Minh',
      guests: [{ email: 'guest@example.invalid' }],
    },
  };
  args.buildPayload = () => payload;
  const { result } = await mount(args);
  await act(() => result.current.save());
  expect(args.addEvent).toHaveBeenCalledWith(payload, {
    requestId: args.draft.requestId,
  });
  args.addEvent.mockResolvedValueOnce({ id: 'confirmed', title: 'Original' });
  const retry = (result.current.recoveryNotice!.props.children[1] as any).props
    .onClick;
  await act(() => retry());
  expect(args.addEvent).toHaveBeenLastCalledWith(payload, {
    requestId: args.draft.requestId,
  });
  expect(args.updateEvent).not.toHaveBeenCalled();
  invitationQuery.data = undefined;
});

it('refuses Outlook guest submission without current capability', async () => {
  const args = fixture();
  args.source = {
    ...args.source,
    provider: 'microsoft',
    externalCalendarId: 'calendar',
    writable: true,
    accountEmail: 'host@example.invalid',
  };
  invitationQuery.data = undefined;
  args.buildPayload = () => ({
    title: 'Original',
    source: { provider: 'microsoft' as const, connectionId: 'owned' },
    invitation: {
      timeZone: 'UTC',
      guests: [{ email: 'guest@example.invalid' }],
    },
  });
  const { result } = await mount(args);
  await act(() => result.current.save());
  expect(args.addEvent).not.toHaveBeenCalled();
  expect(args.onError).toHaveBeenCalledOnce();
  expect(args.closeModal).not.toHaveBeenCalled();
});
