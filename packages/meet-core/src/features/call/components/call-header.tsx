'use client';
import { Eye } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
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
  title,
  canManage,
  onRenamed,
  presenceOnly,
  solo,
  recording,
  connection,
  onRetry,
  actions,
}: {
  meetingId: string;
  title: string;
  canManage: boolean;
  onRenamed: (title: string) => void;
  presenceOnly: boolean;
  solo: boolean;
  recording: boolean;
  connection: MeetSignalingStatus;
  onRetry: () => void;
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
        {/* Who turned Mira on stays visible for the whole call. */}
        <RoomMiraNotice meetingId={meetingId} placement="header" />
        {actions}
      </div>
    </header>
  );
}
