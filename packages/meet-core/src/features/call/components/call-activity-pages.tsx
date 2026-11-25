'use client';

import { Clock3, SlidersHorizontal } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { MeetRoomController } from '../lib/room-controller';
import { useMeetCallUx } from '../prejoin/use-meet-call-ux';
import type { ActivityPage } from './activities-menu';
import { roomActivitySettings } from './call-activity-settings';
import { RoomActivitiesPage, type useRoomTools } from './call-room-tools';
import { canStartClassTimer, ClassTimerControls } from './class-timer';
import { TimerModes } from './timer-modes';

/**
 * Activities dialog pages that render in place: the room timer for hosts and
 * co-hosts while the room offers one, and Room activities for people who may
 * use the room's tools. With Meet UX v2 the Activities menu folds the room
 * timer into the one Timer entry (see `mergeActivityTiles`).
 */
export function useCallActivityPages({
  meetingId,
  room,
  roomTools,
  liveShortcuts,
  personal,
}: {
  meetingId: string;
  room: MeetRoomController;
  roomTools: ReturnType<typeof useRoomTools>;
  liveShortcuts: ReactNode;
  personal: { active: boolean; toggle: () => void };
}): ActivityPage[] {
  const t = useTranslations('meet.call');
  const merged = useMeetCallUx();
  const { state } = room;
  return [
    ...(canStartClassTimer(state)
      ? [
          {
            id: 'class-timer',
            label: t('class_timer'),
            icon: Clock3,
            active: !!state.classTimer && state.classTimer.status !== 'ended',
            // With Meet UX v2 this page is the one Timer for a host or
            // co-host who does not browse the tools; it keeps Just me too.
            page: () =>
              merged ? (
                <TimerModes room={{ meetingId, state }} />
              ) : (
                <ClassTimerControls meetingId={meetingId} state={state} />
              ),
          },
        ]
      : []),
    ...(roomTools.canUse
      ? [
          {
            id: 'room-activities',
            label: t('room_tools.title'),
            icon: SlidersHorizontal,
            active: false,
            listed: false,
            page: (close: () => void) => (
              <RoomActivitiesPage
                activities={liveShortcuts}
                personal={personal}
                settings={
                  roomTools.canConfigure
                    ? roomActivitySettings(room)
                    : undefined
                }
                onClose={close}
              />
            ),
          },
        ]
      : []),
  ];
}
