'use client';

import { Clock3, SlidersHorizontal } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { MeetRoomController } from '../lib/room-controller';
import type { ActivityPage } from './activities-menu';
import { roomActivitySettings } from './call-activity-settings';
import { RoomActivitiesPage, type useRoomTools } from './call-room-tools';
import { canStartClassTimer, ClassTimerControls } from './class-timer';

/**
 * Activities dialog pages that render in place: the room timer for hosts and
 * co-hosts while the room offers one, and Room activities for people who may
 * use the room's tools.
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
  const { state } = room;
  return [
    ...(canStartClassTimer(state)
      ? [
          {
            id: 'class-timer',
            label: t('class_timer'),
            icon: Clock3,
            active: !!state.classTimer && state.classTimer.status !== 'ended',
            page: () => (
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
