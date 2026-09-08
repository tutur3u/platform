import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { CallEnded } from '@/features/call/components/call-ended';
import { CallShell } from '@/features/call/components/call-shell';
import { ParticipantNameForm } from '@/features/call/components/participant-name-form';
import {
  getMeetCallAccess,
  MeetCallAccessError,
} from '@/features/call/lib/call-access';
import { decodeRoomCode } from '@/features/call/lib/room-code';
import { readMeetingRoomPolicy } from '@/features/meeting-ai/server/room-access';

export const metadata: Metadata = {
  title: 'Call',
  description: 'Join a Tuturuuu Meet call.',
};

interface RoomPageProps {
  searchParams?: Promise<{ notes?: string }>;
  params: Promise<{ code: string; locale: string }>;
}

/**
 * The single entry point for a call, addressed by room code.
 *
 * Deliberately outside the `[wsId]` segment so the call renders full-bleed with
 * no sidebar, and so a shared link never has to carry a workspace id: the code
 * encodes the meeting, and the workspace is resolved from it.
 */
export default async function RoomPage({
  params,
  searchParams,
}: RoomPageProps) {
  await connection();

  const { code, locale } = await params;
  const meetingId = decodeRoomCode(code);
  if (!meetingId) notFound();

  const t = await getTranslations('meet.call');
  const access = await getMeetCallAccess(meetingId, t('guest')).catch(
    (error: unknown) => {
      if (error instanceof MeetCallAccessError) {
        if (error.status === 401) {
          const invite = `${locale === 'en' ? '' : `/${locale}`}/r/${code}`;
          redirect(`/login?next=${encodeURIComponent(invite)}`);
        }
        if (error.status === 403 || error.status === 404) notFound();
      }
      throw error;
    }
  );
  const {
    user,
    meeting,
    isHost,
    canReadWorkspace,
    displayName,
    avatarUrl,
    workspaceSlug,
  } = access;
  const wsId = meeting.ws_id;
  const leaveHref = canReadWorkspace
    ? `/${workspaceSlug}/meetings/${meeting.id}`
    : '/';
  const policy = await readMeetingRoomPolicy({
    meetingId,
    wsId,
    userId: user.id,
    isHost,
  });
  if (policy.ended)
    return (
      <CallEnded
        initialShowNotes={(await searchParams)?.notes === '1'}
        canManage={isHost}
        canReadNotes={policy.canReadNotes}
        shareNotesAfterMeeting={policy.settings?.shareNotesAfterMeeting}
        meetingId={meetingId}
        wsId={wsId}
        meetingName={meeting.name ?? t('untitled_meeting')}
        backHref={canReadWorkspace ? `/${workspaceSlug}/meetings` : '/'}
      />
    );
  if (access.needsDisplayName)
    return (
      <ParticipantNameForm
        initialName={access.suggestedDisplayName ?? ''}
        meetingName={meeting.name ?? t('untitled_meeting')}
        leaveHref={leaveHref}
      />
    );

  return (
    <CallShell
      defaultDisplayName={displayName}
      defaultAvatarUrl={avatarUrl}
      leaveHref={leaveHref}
      canReadWorkspace={canReadWorkspace}
      meetingId={meeting.id}
      meetingName={meeting.name ?? t('untitled_meeting')}
      wsId={wsId}
    />
  );
}
