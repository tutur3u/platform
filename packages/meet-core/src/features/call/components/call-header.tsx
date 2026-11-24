'use client';
import { Eye } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';
import type { MeetSignalingStatus } from '../lib/signaling';
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
  actions: ReactNode;
}) {
  const t = useTranslations('meet.call');
  return (
    <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:gap-3 sm:px-4">
      <div className="flex min-w-0 flex-[1_1_12rem] items-center gap-2">
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
            <Eye aria-hidden="true" className="size-3.5" />
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
        />
        {actions}
      </div>
    </header>
  );
}
