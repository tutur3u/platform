'use client';
import { Eye } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';
import type { MeetSignalingStatus } from '../lib/signaling';
import { usePhoneChrome } from '../phone/use-phone-chrome';
import { CallTopBarConnection } from './call-top-bar';
import { MeetingStatus, MeetingTitle } from './meeting-title';
import { RoomMiraNotice } from './room-mira-notice';

/**
 * The call's top bar: the meeting name, then its mode and live status, then
 * the room-wide controls on the right.
 */
export function CallHeader({
  meetingId,
  accountId,
  title,
  canManage,
  onRenamed,
  presenceOnly,
  solo,
  recording,
  connection,
  onRetry,
  privateMiraUsers,
  miraAcceptanceEventId,
  actions,
}: {
  meetingId: string;
  accountId?: string;
  title: string;
  canManage: boolean;
  onRenamed: (title: string) => void;
  presenceOnly: boolean;
  solo: boolean;
  recording: boolean;
  connection: MeetSignalingStatus;
  onRetry: () => void;
  /** People using Mira privately, listed in the Mira control. */
  privateMiraUsers?: ComponentProps<typeof RoomMiraNotice>['privateUsers'];
  miraAcceptanceEventId?: string;
  actions: ReactNode;
}) {
  const t = useTranslations('meet.call');
  // A phone with the redesigned flow keeps the bar to one row; the title truncates first.
  const phone = usePhoneChrome();
  return (
    <header
      className={cn(
        'flex items-center gap-2 border-b px-3 py-2 sm:gap-3 sm:px-4',
        !phone && 'flex-wrap'
      )}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-2',
          phone ? 'flex-1' : 'flex-[1_1_12rem]'
        )}
      >
        <MeetingTitle
          meetingId={meetingId}
          title={title}
          canManage={canManage}
          onSaved={onRenamed}
        />
        {presenceOnly && (
          <Badge
            variant="secondary"
            className="h-7 shrink-0 gap-1.5 rounded-full px-2.5"
          >
            <Eye aria-hidden="true" className="size-4" />
            {t('presence_only')}
          </Badge>
        )}
        <MeetingStatus solo={solo} recording={recording} />
        <CallTopBarConnection status={connection} onRetry={onRetry} />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {/* The one Mira control; it names who turned Mira on for the whole call. */}
        <RoomMiraNotice
          meetingId={meetingId}
          accountId={accountId}
          privateUsers={privateMiraUsers}
          acceptanceEventId={miraAcceptanceEventId}
        />
        {actions}
      </div>
    </header>
  );
}
