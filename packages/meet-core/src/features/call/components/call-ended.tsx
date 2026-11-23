'use client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { useEndedRoom } from '../hooks/use-ended-room';
import type { CallLifecycle } from '../lib/call-state';
import { useWideEndedLayout } from './ended-layout';
import { EndedMeetingFactsRow } from './ended-meeting-facts-row';
import { EndedMeetingRating } from './ended-meeting-rating';
import { EndedMoreMenu } from './ended-more-menu';
import {
  EndedNotesPanel,
  isEndedReader,
  useEndedNotes,
} from './ended-notes-panel';
import { EndedSummaryCard } from './ended-summary-card';
import { NewMeetingButton } from './new-meeting-button';

const primaryClass = 'h-11 w-full rounded-full';

export function CallEnded({
  accountId,
  lifecycle = 'ended',
  initialShowNotes = false,
  canManage,
  canReadNotes,
  canStartMeeting = false,
  shareNotesAfterMeeting,
  wsId,
  meetingId,
  meetingName,
  backHref,
  saving = false,
  notes,
}: {
  accountId: string;
  /** `ended` when the room closed; any other value means this device left. */
  lifecycle?: CallLifecycle;
  initialShowNotes?: boolean;
  canManage: boolean;
  canReadNotes: boolean;
  /** Workspace members outside Parley may start another meeting from here. */
  canStartMeeting?: boolean;
  shareNotesAfterMeeting?: boolean;
  wsId: string;
  meetingId: string;
  meetingName: string;
  backHref: string;
  saving?: boolean;
  /** Replaces the default notes reader, e.g. with the meeting page reader. */
  notes?: ReactNode;
}) {
  const ended = lifecycle === 'ended';
  useEndedRoom(accountId, meetingId, ended);
  const queryClient = useQueryClient();
  const t = useTranslations('meet.call');
  const [showNotes, setShowNotes] = useState(initialShowNotes);
  const [shareAfter, setShareAfter] = useState(shareNotesAfterMeeting);
  const canSeeNotes = canManage || canReadNotes;
  const { ai, availability } = useEndedNotes(wsId, meetingId, canSeeNotes);
  const reader = isEndedReader(availability) ? availability : null;
  const open = showNotes && reader !== null;
  const wide = useWideEndedLayout();
  const rejoinable = !ended;
  const backLink = (primary: boolean) => (
    <Button
      asChild
      size="lg"
      variant={primary ? 'default' : 'outline'}
      className={primaryClass}
    >
      <Link
        href={backHref}
        onClick={() => {
          void queryClient.invalidateQueries({
            queryKey: ['meetings'],
            refetchType: 'all',
          });
          void queryClient.invalidateQueries({
            queryKey: ['meet-room-state', meetingId],
          });
        }}
      >
        <ArrowLeft className="size-4" />
        {t('back_to_meet')}
      </Link>
    </Button>
  );
  const showNewMeeting = ended && canStartMeeting;
  const secondary = rejoinable ? (
    backLink(false)
  ) : showNewMeeting ? (
    <NewMeetingButton
      wsId={wsId}
      disabled={saving}
      variant="outline"
      size="lg"
      className={primaryClass}
    />
  ) : null;
  const primary = rejoinable ? (
    <Button
      size="lg"
      className={primaryClass}
      onClick={() => window.location.reload()}
      disabled={saving}
    >
      {t('rejoin_call')}
    </Button>
  ) : (
    backLink(true)
  );
  const hint = !ended
    ? t('call_left_hint')
    : !canSeeNotes
      ? t('ended_hint')
      : undefined;
  const content =
    open && reader
      ? (notes ?? <EndedNotesPanel ai={ai} reader={reader} inline={!wide} />)
      : null;
  const inline = !wide && !notes;
  return (
    <main
      className={cn(
        'flex min-h-dvh flex-col items-center bg-background px-4 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]',
        !open && 'justify-center'
      )}
    >
      <div
        className={cn(
          'grid w-full gap-4',
          open && wide
            ? 'max-w-6xl grid-cols-[minmax(0,26rem)_minmax(0,1fr)] items-start gap-6'
            : open
              ? 'max-w-xl'
              : 'max-w-md'
        )}
      >
        <div className="grid min-w-0 content-start gap-4">
          <EndedSummaryCard
            meetingName={meetingName}
            title={t(ended ? 'call_ended_title' : 'call_left_title')}
            hint={hint}
            saving={saving}
            facts={
              <EndedMeetingFactsRow
                wsId={wsId}
                meetingId={meetingId}
                canSeeNotes={canSeeNotes}
              />
            }
            actions={
              <>
                {primary}
                {secondary}
              </>
            }
            reader={inline ? content : undefined}
            more={
              <EndedMoreMenu
                accountId={accountId}
                wsId={wsId}
                meetingId={meetingId}
                disabled={saving}
                canRestore={ended && canManage}
                canAddTask={
                  canManage && MEETING_APP === 'meet' && availability === 'none'
                }
                canManage={canManage}
                shareNotesAfterMeeting={shareAfter}
                onShareNotesChange={setShareAfter}
                reader={reader}
                readerOpen={open}
                onToggleReader={() => setShowNotes(!open)}
              />
            }
          />
          {!wide && !inline && content}
          <EndedMeetingRating accountId={accountId} meetingId={meetingId} />
        </div>
        {wide && content && <div className="min-w-0">{content}</div>}
      </div>
    </main>
  );
}
