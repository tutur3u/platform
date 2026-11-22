'use client';

import {
  Captions,
  Link2,
  MoreHorizontal,
  RefreshCw,
  WifiOff,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { MeetMailShare, MeetMailMenuItem } from './meet-mail-share';
import { buildJoinUrl, encodeRoomCode } from '../lib/room-code';
import {
  getSignalingRecovery,
  type MeetSignalingStatus,
} from '../lib/signaling';
import { MeetingActionHint } from './meeting-action-hint';

/**
 * Secondary in-call actions behind one overflow control so the top bar keeps
 * only the title, live status and primary media/assistant controls visible.
 * The transcript entry is listed only for people allowed to read notes.
 */
export function CallTopBarMore({
  meetingId,
  meetingName,
  mailContext,
  canReadNotes,
  transcriptOpen,
  onToggleTranscript,
}: {
  mailContext?: {
    workspaceId: string;
    actorId: string;
    canReadWorkspace: boolean;
    canManage: boolean;
  };
  meetingId: string;
  meetingName: string;
  canReadNotes: boolean;
  transcriptOpen: boolean;
  onToggleTranscript: () => void;
}) {
  const [mailOpen, setMailOpen] = useState(false);
  const t = useTranslations('meet.call');
  const aiT = useTranslations('meet.ai');
  const moreLabel = useTranslations('programmingPlayground')('more');

  const copyInvite = async () => {
    const code = encodeRoomCode(meetingId);
    try {
      await navigator.clipboard.writeText(
        `${meetingName}\n${buildJoinUrl(window.location.origin, meetingId)}\n${t('meeting_code')}: ${code}`
      );
      toast.success(t('invite_copied'));
    } catch {
      toast.error(t('connection_copy_failed'));
    }
  };

  return (
    <>
      <DropdownMenu>
        <MeetingActionHint label={moreLabel}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={moreLabel}
              className="size-8 rounded-full"
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </MeetingActionHint>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => void copyInvite()}>
            <Link2 className="size-4" />
            {t('copy_invite')}
          </DropdownMenuItem>
          {MEETING_APP === 'meet' &&
            mailContext?.canReadWorkspace &&
            mailContext.canManage && (
              <MeetMailMenuItem onSelect={() => setMailOpen(true)} />
            )}
          {canReadNotes && (
            <DropdownMenuCheckboxItem
              checked={transcriptOpen}
              onCheckedChange={onToggleTranscript}
              // The check sits at the end so this row's icon lines up with
              // the plain rows above it.
              className="pr-8 pl-2 [&>span:first-child]:right-2 [&>span:first-child]:left-auto"
            >
              <Captions className="size-4 text-muted-foreground" />
              {aiT('title')}
            </DropdownMenuCheckboxItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {MEETING_APP === 'meet' &&
        mailContext?.canReadWorkspace &&
        mailContext.canManage &&
        mailOpen && (
          <MeetMailShare
            key={`${meetingId}:${mailContext.actorId}:${mailContext.workspaceId}`}
            open={mailOpen}
            onOpenChange={setMailOpen}
            meetingId={meetingId}
            title={meetingName}
            {...mailContext}
          />
        )}
    </>
  );
}

/**
 * Minimal signaling status: nothing while connected, a quiet labelled icon
 * while signaling is still recovering on its own (`connecting` or
 * `reconnecting`), and a single refresh action only once recovery is
 * exhausted (`error`) or the server ended the call (`closed`).
 */
export function CallTopBarConnection({
  status,
  onRetry,
}: {
  status: MeetSignalingStatus;
  onRetry: () => void;
}) {
  const t = useTranslations('meet.call');
  if (status === 'open') return null;
  if (getSignalingRecovery(status) !== 'exhausted')
    return (
      <output
        aria-label={t('reconnecting')}
        aria-live="polite"
        className="inline-flex size-8 items-center justify-center text-muted-foreground"
        title={t('reconnecting')}
      >
        <WifiOff className="size-4 motion-safe:animate-pulse" />
      </output>
    );
  return (
    <MeetingActionHint label={t('join_error_title')}>
      <Button
        aria-label={`${t('join_error_title')}. ${t('connection_refresh')}`}
        className="h-8 gap-1.5 rounded-full text-xs"
        onClick={onRetry}
        size="sm"
        type="button"
        variant="outline"
      >
        <RefreshCw className="size-3.5" />
        {t('connection_refresh')}
      </Button>
    </MeetingActionHint>
  );
}
