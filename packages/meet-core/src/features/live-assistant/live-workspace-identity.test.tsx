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
  error: undefined as string | undefined,
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
    error: f.error,
    mode: 'personal',
    start: f.start,
    send: vi.fn(),
    stop: vi.fn(),
  }),
}));
vi.mock('../call/components/mira-profile', () => ({ MiraAvatar: () => null }));
vi.mock('./live-review-card', () => ({ LiveReviewCard: () => null }));
import { MeetLivePanel } from './live-panel';
import { useLiveSession } from './live-session-store';

/** Reads what the Private Assistant tab sees: the gate and the start action. */
function TabProbe() {
  const session = useLiveSession('synthetic-meeting', 'synthetic-account');
  return (
    <>
      <output aria-label="accepted">{String(session?.accepted)}</output>
      <button type="button" onClick={() => void session?.controls.start()}>
        probe-talk
      </button>
      <button type="button" onClick={() => session?.controls.openConsent()}>
        probe-consent
      </button>
    </>
  );
}
const accepted = () => screen.getByLabelText('accepted').textContent;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  f.error = undefined;
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
  const localizedMessages = messages;
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={localizedMessages}>
        <MeetLivePanel
          accountId="synthetic-account"
          room={room}
          meetingId="synthetic-meeting"
          outputDeviceId=""
          canManage
          onLeave={onLeave}
        />
        <TabProbe />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByText('probe-consent'));
}
it('offers private own-microphone start to the tab only after a confirmed choice for a distinct account/device', async () => {
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: null,
  });
  f.choice.mockResolvedValue({});
  showPanel(syntheticRoom());
  await screen.findByRole('button', {
    name: messages.meet.live.phase_continue,
  });
  expect(accepted()).toBe('false');
  // The dialog only holds the choice; voice and controls live in the tab.
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByText(/Personal assistant/)).toBeNull();
  expect(screen.queryByText(messages.meet.live.pause)).toBeNull();
  fireEvent.click(screen.getByText('probe-talk'));
  expect(f.start).not.toHaveBeenCalled();
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
  await waitFor(() => expect(accepted()).toBe('true'));
  fireEvent.click(screen.getByText('probe-talk'));
  await waitFor(() =>
    expect(f.start).toHaveBeenCalledWith('personal', [], '', undefined, 'Aoede')
  );
});
it('renders no Mira control of its own and states the 18+ rule beside Continue', async () => {
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: null,
  });
  const adults = messages.meet.mira_adults;
  const described = (element: HTMLElement) =>
    document.getElementById(element.getAttribute('aria-describedby') ?? '')
      ?.textContent;
  showPanel(syntheticRoom());
  // The header's Mira control is the only entry; the panel adds no button.
  expect(
    screen.queryByRole('button', {
      name: messages.meet.live.title,
      hidden: true,
    })
  ).toBeNull();
  const proceed = await screen.findByRole('button', {
    name: messages.meet.live.phase_continue,
  });
  expect(described(proceed)).toBe(adults.consent);
  expect(screen.getByText(adults.consent)).toBeTruthy();
  expect(f.choice).not.toHaveBeenCalled();
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
it("withholds the tab's start until a fresh Continue after disconnect or a policy that no longer confirms it", async () => {
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
          onLeave={vi.fn()}
        />
        <TabProbe />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  fireEvent.click(screen.getByText('probe-consent'));
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
  await waitFor(() => expect(accepted()).toBe('true'));
  room.connectionStatus = 'closed';
  view.rerender(tree());
  await waitFor(() => expect(accepted()).toBe('false'));
  room.connectionStatus = 'open';
  room.state.admission = 'waiting';
  view.rerender(tree());
  await waitFor(() => expect(accepted()).toBe('false'));
  room.state.admission = 'admitted';
  view.rerender(tree());
  await waitFor(() => expect(accepted()).toBe('false'));
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.phase_continue })
  );
  await waitFor(() => expect(accepted()).toBe('true'));
  f.read.mockResolvedValue({
    ...confirmed,
    choice: { ...confirmed.choice, choice: 'mute', revision: 2 },
  });
  await client.refetchQueries({
    queryKey: ['mira-private-choice', 'synthetic-meeting'],
  });
  await waitFor(() => expect(accepted()).toBe('false'));
  expect(f.start).not.toHaveBeenCalled();
});

it('returns focus to the tab control that opened the consent dialog', async () => {
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: null,
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <MeetLivePanel
          accountId="synthetic-account"
          room={syntheticRoom()}
          meetingId="synthetic-meeting"
          outputDeviceId=""
          canManage
          onLeave={vi.fn()}
        />
        <TabProbe />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const opener = screen.getByText('probe-consent');
  opener.focus();
  fireEvent.click(opener);
  await screen.findByRole('button', {
    name: messages.meet.live.phase_continue,
  });
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: 'Escape',
  });
  await waitFor(() => expect(document.activeElement).toBe(opener));
});
