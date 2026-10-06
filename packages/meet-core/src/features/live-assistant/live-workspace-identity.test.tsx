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
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
import type { MeetRoomController } from '../call/lib/room-controller';
import { MeetLivePanel } from './live-panel';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  hidden: vi.fn(),
  start: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: mocks.hidden,
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  listWorkspaces: mocks.list,
}));
vi.mock('./use-live-assistant', () => ({
  useLiveAssistant: () => ({
    status: 'idle',
    mode: 'personal',
    start: mocks.start,
    send: vi.fn(),
  }),
}));
vi.mock('../call/components/mira-profile', () => ({ MiraAvatar: () => null }));
vi.mock('./room-audio', () => ({ RoomAiAudio: () => null }));
vi.mock('./memory-settings', () => ({ MemorySettings: () => null }));
vi.mock('./live-review-card', () => ({ LiveReviewCard: () => null }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.hidden.mockResolvedValue({ hiddenWorkspaceIds: [] });
  mocks.list.mockResolvedValue([
    {
      id: 'personal-workspace',
      name: 'Personal',
      personal: true,
      access_type: 'member',
    },
    {
      id: 'team-workspace',
      name: 'Synthetic team',
      personal: false,
      access_type: 'member',
    },
    {
      id: 'guest-workspace',
      name: 'Synthetic guest',
      personal: false,
      access_type: 'guest',
    },
  ]);
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

it('opens and selects a member workspace inside the actual Live dialog for a distinct device identity', async () => {
  const room = {
    state: {
      selfUserId: 'device-participant',
      participants: {},
      chat: [],
      liveAssistant: null,
    },
    localStream: null,
    remoteMedia: {},
    media: { audioEnabled: false },
    getSelectedDevices: () => ({ audio: '', microphoneRevision: 0 }),
  } as unknown as MeetRoomController;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="account-owner">
        <NextIntlClientProvider locale="en" messages={messages}>
          <MeetLivePanel
            accountId="account-owner"
            room={room}
            meetingId="synthetic-meeting"
            outputDeviceId=""
            canManage
            onOpenChat={vi.fn()}
          />
        </NextIntlClientProvider>
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Mira Live' }));
  await waitFor(() => expect(mocks.list).toHaveBeenCalled());
  const trigger = screen.getByRole('combobox', { name: 'Workspace' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const team = await screen.findByRole('option', { name: 'Synthetic team' });
  expect(screen.queryByRole('option', { name: 'Synthetic guest' })).toBeNull();
  fireEvent.click(team);
  await waitFor(() => expect(trigger.textContent).toContain('Synthetic team'));
  fireEvent.click(screen.getByRole('button', { name: /Personal assistant/ }));
  await waitFor(() =>
    expect(mocks.start).toHaveBeenCalledWith(
      'personal',
      [],
      '',
      'team-workspace',
      'Aoede'
    )
  );
  act(() =>
    client.setQueryData(
      ['workspace-hidden', 'account-owner'],
      ['team-workspace']
    )
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: /Personal assistant/,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
  );
  fireEvent.click(screen.getByRole('button', { name: /Personal assistant/ }));
  expect(mocks.start).toHaveBeenCalledTimes(1);
});
