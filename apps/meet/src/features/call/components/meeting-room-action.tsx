'use client';
import { useQuery } from '@tanstack/react-query';
import { FileText, Video } from '@tuturuuu/icons';
import { getMeetCallRoomState } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { encodeRoomCode } from '../lib/room-code';

export function MeetingRoomAction({ meetingId }: { meetingId: string }) {
  const t = useTranslations('meet.call');
  const { data } = useQuery({
    queryKey: ['meet-room-state', meetingId],
    queryFn: () => getMeetCallRoomState(meetingId),
    staleTime: 15000,
    retry: false,
  });
  const notes = data?.ended && data.canReadNotes;
  return (
    <Button
      asChild
      size="sm"
      className="flex-1"
      variant={data?.ended ? 'secondary' : 'default'}
    >
      <Link href={`/r/${encodeRoomCode(meetingId)}${notes ? '?notes=1' : ''}`}>
        {data?.ended ? (
          <FileText className="size-3.5" />
        ) : (
          <Video className="size-3.5" />
        )}
        {t(
          notes
            ? 'view_meeting_notes'
            : data?.ended
              ? 'call_ended_title'
              : data
                ? 'join_call'
                : 'open_meeting'
        )}
      </Link>
    </Button>
  );
}
