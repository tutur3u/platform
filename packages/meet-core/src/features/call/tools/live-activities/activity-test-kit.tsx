import {
  EMPTY_LIVE_ACTIVITIES_MINE,
  EMPTY_LIVE_ACTIVITIES_SNAPSHOT,
  type LiveActivitiesHost,
  type LiveActivitiesMine,
  type LiveActivitiesSnapshot,
  type LiveActivityCommand,
  type MeetRealtimeClientMessage,
} from '@tuturuuu/realtime/meet';
import { act, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentType } from 'react';
import { vi } from 'vitest';
import messages from '../../../../../../../apps/meet/messages/en.json';
import { MeetToolProvider } from '../context';
import {
  closeLiveActivitiesRoom,
  liveActivitiesRoom,
} from './activities-store';
import type { MeetToolPanelProps } from './meet-tool';

/** Shared setup for the activity panel tests: a real room store, no socket. */
export const MEETING_ID = 'activity-panel-test';
export const SELF = '11111111-1111-4111-8111-111111111111';
export const ANA = '22222222-2222-4222-8222-222222222222';
export const strings = messages.meet.call.live_activities;

export const EMPTY_HOST: LiveActivitiesHost = {
  assessment: { responses: [], answers: {} },
  flashcards: { cards: [], progress: [] },
  game: { rounds: [] },
  icebreaker: { hidden: [] },
};

const socket = vi.fn<(message: MeetRealtimeClientMessage) => boolean>(
  () => true
);

/** The commands the panel sent to the room, oldest first. */
export function sent(): LiveActivityCommand[] {
  return socket.mock.calls.flatMap(([message]) =>
    message.type === 'activity.command' ? [message.command] : []
  );
}

export function lastRequestId() {
  const message = socket.mock.calls.at(-1)?.[0];
  return message && 'requestId' in message ? message.requestId : undefined;
}

/** Puts the room in a state as its messages would, for one viewer. */
export function room(state: {
  manager?: boolean;
  snapshot?: Partial<LiveActivitiesSnapshot>;
  mine?: Partial<LiveActivitiesMine>;
  host?: Partial<LiveActivitiesHost>;
}) {
  const store = liveActivitiesRoom(MEETING_ID);
  act(() => {
    if (state.manager !== undefined) store.setManager(state.manager);
    store.receive({
      type: 'activity.snapshot',
      snapshot: { ...EMPTY_LIVE_ACTIVITIES_SNAPSHOT, ...state.snapshot },
    });
    store.receive({
      type: 'activity.mine',
      mine: { ...EMPTY_LIVE_ACTIVITIES_MINE, ...state.mine },
    });
    if (state.host)
      store.receive({
        type: 'activity.host',
        host: { ...EMPTY_HOST, ...state.host },
      });
  });
  return store;
}

export function openRoom(manager: boolean) {
  closeLiveActivitiesRoom(MEETING_ID);
  const store = liveActivitiesRoom(MEETING_ID);
  store.setManager(manager);
  store.open(socket);
  socket.mockClear();
  return store;
}

export function closeRoom() {
  closeLiveActivitiesRoom(MEETING_ID);
  socket.mockClear();
}

export function renderPanel(
  Panel: ComponentType<MeetToolPanelProps>,
  canManage: boolean
) {
  openRoom(canManage);
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MeetToolProvider
        value={{
          meetingId: MEETING_ID,
          accountId: SELF,
          requiresAccount: false,
          canManage,
          enabled: true,
          selfUserId: SELF,
          people: {
            [SELF]: { displayName: 'Me' },
            [ANA]: { displayName: 'Ana' },
          },
          close: () => {},
        }}
      >
        <Panel meetingId={MEETING_ID} />
      </MeetToolProvider>
    </NextIntlClientProvider>
  );
}
