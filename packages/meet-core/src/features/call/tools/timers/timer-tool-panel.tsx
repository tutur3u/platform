'use client';

import { LockKeyhole, Timer } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { TimerModes, useRoomTimer } from '../../components/timer-modes';
import { ActivityStatus } from '../../stage-layout/activity-shell';
import { ActivityPanel } from '../activity-panel';
import { useMeetTool } from '../context';
import { PersonalTimer } from './personal-timer';

/**
 * The Timer tool. With Meet UX v2 the call provides its room timer, and the
 * panel is the one Timer: Just me or Everyone. Otherwise it is the private
 * countdown on this device.
 */
export function TimerToolPanel() {
  const { close } = useMeetTool();
  const t = useTranslations('meet.call.tools.timer');
  const activitiesT = useTranslations('meet.call.activities');
  const room = useRoomTimer();
  return (
    <ActivityPanel
      title={room ? activitiesT('merged.timer') : t('title')}
      icon={Timer}
      status={
        room ? undefined : (
          <ActivityStatus>
            <LockKeyhole aria-hidden="true" className="size-3 shrink-0" />
            <span className="truncate">{t('private')}</span>
          </ActivityStatus>
        )
      }
      closeLabel={t('close')}
      onClose={close}
    >
      {room ? <TimerModes room={room} /> : <PersonalTimer />}
    </ActivityPanel>
  );
}
