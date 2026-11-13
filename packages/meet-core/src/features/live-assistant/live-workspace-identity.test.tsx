// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
import type { MeetRoomController } from '../call/lib/room-controller';
const f = vi.hoisted(() => ({
  start: vi.fn(),
  read: vi.fn(),
  choice: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  readPrivateMiraPolicy: f.read,
  setPrivateMiraChoice: f.choice,
}));
vi.mock('./use-live-assistant', () => ({
  useLiveAssistant: () => ({
    status: 'idle',
    mode: 'personal',
    start: f.start,
    send: vi.fn(),
    stop: vi.fn(),
  }),
}));
vi.mock('../call/components/mira-profile', () => ({ MiraAvatar: () => null }));
vi.mock('./live-review-card', () => ({ LiveReviewCard: () => null }));
import { MeetLivePanel } from './live-panel';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function syntheticRoom() {
  return {
    state: {
      selfUserId: 'synthetic-device',
      participants: {},
      chat: [],
      admission: 'admitted',
    },
    connectionStatus: 'open',
    media: { audioEnabled: false },
    getSelectedDevices: () => ({ audio: '', microphoneRevision: 0 }),
    leave: vi.fn(),
    toggleMicrophone: vi.fn(),
  } as unknown as MeetRoomController & { leave: ReturnType<typeof vi.fn> };
}
function showPanel(room: MeetRoomController, onLeave = vi.fn()) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <MeetLivePanel
          accountId="synthetic-account"
          room={room}
          meetingId="synthetic-meeting"
          outputDeviceId=""
          canManage
          onOpenChat={vi.fn()}
          onLeave={onLeave}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.title })
  );
}
it('offers only private own-microphone start after a confirmed choice for a distinct account/device', async () => {
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: null,
  });
  f.choice.mockResolvedValue({});
  showPanel(syntheticRoom());
  const personal = await screen.findByRole('button', {
    name: /Personal assistant/,
  });
  expect((personal as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('combobox', { name: 'Workspace' })).toBeNull();
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: {
      choice: 'continue',
      meetingId: 'synthetic-meeting',
      accountId: 'synthetic-account',
      version: 'synthetic-v1',
      recordedAt: 1,
      revision: 1,
    },
  });
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: messages.meet.live.phase_continue,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.phase_continue })
  );
  await waitFor(() =>
    expect((personal as HTMLButtonElement).disabled).toBe(false)
  );
  fireEvent.click(personal);
  await waitFor(() =>
    expect(f.start).toHaveBeenCalledWith('personal', [], '', undefined, 'Aoede')
  );
});
it('leaves through the call shell instead of closing the room socket directly', async () => {
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: null,
  });
  f.choice.mockResolvedValue({});
  const room = syntheticRoom();
  const onLeave = vi.fn();
  showPanel(room, onLeave);
  fireEvent.click(
    await screen.findByRole('button', { name: messages.meet.live.phase_leave })
  );
  await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
  expect(room.leave).not.toHaveBeenCalled();
});
it('blocks the consent choice with a reason while the room socket is not admitted', async () => {
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: null,
  });
  const room = syntheticRoom();
  Object.assign(room, { connectionStatus: 'connecting' });
  showPanel(room);
  expect((await screen.findByRole('alert')).textContent).toContain(
    messages.meet.live.choice_not_connected
  );
  expect(
    (
      screen.getByRole('button', {
        name: messages.meet.live.phase_continue,
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(f.read).not.toHaveBeenCalled();
});
it('disables personal start until a fresh Continue after disconnect or a policy that no longer confirms it', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const room = syntheticRoom();
  const confirmed = {
    version: 'synthetic-v1',
    available: true,
    choice: {
      choice: 'continue' as const,
      meetingId: 'synthetic-meeting',
      accountId: 'synthetic-account',
      version: 'synthetic-v1',
      recordedAt: 1,
      revision: 1,
    },
  };
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: null,
  });
  f.choice.mockResolvedValue({});
  const tree = () => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <MeetLivePanel
          accountId="synthetic-account"
          room={room}
          meetingId="synthetic-meeting"
          outputDeviceId=""
          canManage
          onOpenChat={vi.fn()}
          onLeave={vi.fn()}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.title })
  );
  const personal = () =>
    screen.getByRole('button', {
      name: /Personal assistant/,
    }) as HTMLButtonElement;
  f.read.mockResolvedValue(confirmed);
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: messages.meet.live.phase_continue,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.phase_continue })
  );
  await waitFor(() => expect(personal().disabled).toBe(false));
  room.connectionStatus = 'closed';
  view.rerender(tree());
  await waitFor(() => expect(personal().disabled).toBe(true));
  room.connectionStatus = 'open';
  room.state.admission = 'waiting';
  view.rerender(tree());
  await waitFor(() => expect(personal().disabled).toBe(true));
  room.state.admission = 'admitted';
  view.rerender(tree());
  await waitFor(() => expect(personal().disabled).toBe(true));
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.phase_continue })
  );
  await waitFor(() => expect(personal().disabled).toBe(false));
  f.read.mockResolvedValue({
    ...confirmed,
    choice: { ...confirmed.choice, choice: 'mute', revision: 2 },
  });
  await client.refetchQueries({
    queryKey: ['mira-private-choice', 'synthetic-meeting'],
  });
  await waitFor(() => expect(personal().disabled).toBe(true));
  expect(f.start).not.toHaveBeenCalled();
});
