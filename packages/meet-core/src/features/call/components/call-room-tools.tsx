'use client';

import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { CalendarDays } from '@tuturuuu/icons';
import type { MeetRoomSettings } from '@tuturuuu/realtime/meet';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ControlButton } from './control-bar';

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
 * More-menu rows that are not activities: live activity shortcuts that are
 * running now, and this person's private tools. Launching shared work lives
 * in the Activities menu; who may launch it lives in Settings.
 */
export function CallRoomTools({
  policy,
  actions,
  activities,
}: {
  policy: ReturnType<typeof useRoomTools>;
  actions: { personal: { active: boolean; toggle: () => void } };
  activities: ReactNode;
}) {
  const t = useTranslations('meet.call.room_tools');
  const privateT = useTranslations('meet.call.private_tools');

  if (MEETING_APP !== 'meet') return null;
  return (
    <>
      {policy.canUse && (
        <p className="px-3 pt-2 pb-1 font-medium text-muted-foreground text-xs">
          {t('title')}
        </p>
      )}
      {activities}
      {policy.canUse && (
        <ControlButton
          active={actions.personal.active}
          icon={CalendarDays}
          label={privateT('title')}
          onClick={actions.personal.toggle}
        />
      )}
    </>
  );
}
