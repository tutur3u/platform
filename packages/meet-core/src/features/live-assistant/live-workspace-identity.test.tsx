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
afterEach(cleanup);
it('offers only private own-microphone start after a confirmed choice for a distinct account/device', async () => {
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: null,
  });
  f.choice.mockResolvedValue({});
  const room = {
    state: { selfUserId: 'synthetic-device', participants: {}, chat: [] },
    media: { audioEnabled: false },
    getSelectedDevices: () => ({ audio: '', microphoneRevision: 0 }),
    leave: vi.fn(),
    toggleMicrophone: vi.fn(),
  } as unknown as MeetRoomController;
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
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.title })
  );
  const personal = await screen.findByRole('button', {
    name: /Personal assistant/,
  });
  expect((personal as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('combobox', { name: 'Workspace' })).toBeNull();
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: { choice: 'continue' },
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
