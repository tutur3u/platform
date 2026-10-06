'use client';
import { useQuery } from '@tanstack/react-query';
import { FileText, Video } from '@tuturuuu/icons';
import { getMeetCallRoomState } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { useEndedRoom } from '../hooks/use-ended-room';
import { forgetEndedRoom, rememberEndedRoom } from '../lib/ended-room-cache';
import { encodeRoomCode } from '../lib/room-code';

export function MeetingRoomAction({
  meetingId,
  accountId,
}: {
  meetingId: string;
  accountId: string;
}) {
  const t = useTranslations('meet.call');
  const scope = useRef({ accountId, meetingId });
  if (
    scope.current.accountId !== accountId ||
    scope.current.meetingId !== meetingId
  )
    scope.current = { accountId, meetingId };
  const knownEnded = useEndedRoom(accountId, meetingId);
  const { data } = useQuery({
    queryKey: ['meet-room-state', meetingId, accountId],
    queryFn: async ({ signal }) => {
      const current = scope.current;
      if (current.accountId !== accountId || current.meetingId !== meetingId)
        throw new DOMException('Meeting scope changed', 'AbortError');
      const state = await getMeetCallRoomState(meetingId, { signal });
      if (signal.aborted || scope.current !== current)
        throw new DOMException('Meeting scope changed', 'AbortError');
      if (state.ended) rememberEndedRoom(accountId, meetingId);
      else forgetEndedRoom(accountId, meetingId);
      return state;
    },
    enabled: !!accountId,
    staleTime: 15000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const ended = knownEnded || data?.ended;
  // A cached terminal hint cannot decide permissions; the destination checks them.
  const notes = ended && data?.canReadNotes !== false;
  return (
    <Button
      asChild
      size="sm"
      className="flex-1"
      variant={ended ? 'secondary' : 'default'}
    >
      <Link href={`/r/${encodeRoomCode(meetingId)}${notes ? '?notes=1' : ''}`}>
        {ended ? (
          <FileText className="size-3.5" />
        ) : (
          <Video className="size-3.5" />
        )}
        {t(
          notes
            ? 'view_meeting_notes'
            : ended
              ? 'call_ended_title'
              : data
                ? 'join_call'
                : 'open_meeting'
        )}
      </Link>
    </Button>
  );
}
