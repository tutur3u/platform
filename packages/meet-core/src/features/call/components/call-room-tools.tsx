'use client';

import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { CalendarDays } from '@tuturuuu/icons';
import type { MeetRoomSettings } from '@tuturuuu/realtime/meet';
import { useTranslations } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';
import { CallActivitySettings } from './call-activity-settings';
import { ControlButton, ControlMenuScope } from './control-button';
import {
  MeetSettingsCard,
  MeetSettingsHeading,
  MeetSettingsStack,
} from './meet-settings-card';

export type RoomToolsMode = NonNullable<MeetRoomSettings['advancedTools']>;

export function useRoomTools(
  mode: RoomToolsMode | undefined,
  managesParticipants: boolean
) {
  return {
    canConfigure: MEETING_APP === 'meet' && managesParticipants,
    canUse:
      MEETING_APP === 'meet' && (managesParticipants || mode === 'everyone'),
    showPreview:
      MEETING_APP === 'meet' && !managesParticipants && mode === 'showcase',
  };
}

/**
 * The Activities dialog's Room activities page: shortcuts to live polls and
 * quizzes, this person's private tools, and for hosts who may open room
 * activities. The visibility settings also stay in Settings.
 */
export function RoomActivitiesPage({
  activities,
  personal,
  settings,
  onClose,
}: {
  /** Live activity shortcuts, rendered as rows. */
  activities: ReactNode;
  personal: { active: boolean; toggle: () => void };
  settings?: ComponentProps<typeof CallActivitySettings>;
  /** Closes the dialog once a row opens its panel. */
  onClose: () => void;
}) {
  const t = useTranslations('meet.call.room_tools');
  const privateT = useTranslations('meet.call.private_tools');
  return (
    <MeetSettingsStack>
      <MeetSettingsCard>
        <MeetSettingsHeading title={t('shortcuts')} />
        <ControlMenuScope onClose={onClose}>
          <div className="-mx-3 flex flex-col gap-1">
            {activities}
            <ControlButton
              active={personal.active}
              icon={CalendarDays}
              label={privateT('title')}
              onClick={personal.toggle}
            />
          </div>
        </ControlMenuScope>
      </MeetSettingsCard>
      {settings && <CallActivitySettings {...settings} />}
    </MeetSettingsStack>
  );
}
