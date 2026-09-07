import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { CallShell } from '@/features/call/components/call-shell';
import {
  getMeetCallAccess,
  MeetCallAccessError,
} from '@/features/call/lib/call-access';
import { getMeetCallSession } from '@/features/call/lib/call-session';
import { decodeRoomCode } from '@/features/call/lib/room-code';

export const metadata: Metadata = {
  title: 'Call',
  description: 'Join a Tuturuuu Meet call.',
};

interface RoomPageProps {
  params: Promise<{ code: string; locale: string }>;
}

/**
 * The single entry point for a call, addressed by room code.
 *
 * Deliberately outside the `[wsId]` segment so the call renders full-bleed with
 * no sidebar, and so a shared link never has to carry a workspace id: the code
 * encodes the meeting, and the workspace is resolved from it.
 */
export default async function RoomPage({ params }: RoomPageProps) {
  await connection();

  const { code, locale } = await params;
  const meetingId = decodeRoomCode(code);
  if (!meetingId) notFound();

  const access = await getMeetCallAccess(meetingId).catch((error: unknown) => {
    if (error instanceof MeetCallAccessError) {
      if (error.status === 401) {
        const invite = `${locale === 'en' ? '' : `/${locale}`}/r/${code}`;
        redirect(`/login?next=${encodeURIComponent(invite)}`);
      }
      if (error.status === 403 || error.status === 404) notFound();
    }
    throw error;
  });
  const { user, meeting, isHost, canReadWorkspace } = access;
  const wsId = meeting.ws_id;
  const t = await getTranslations('meet.call');

  const profile = user as {
    display_name?: string | null;
    email?: string | null;
    full_name?: string | null;
  };
  const displayName: string =
    profile.display_name || profile.full_name || profile.email || t('guest');

  const session = await getMeetCallSession({
    displayName,
    isHost,
    admission: canReadWorkspace ? 'open' : 'lobby',
    meetingId: meeting.id,
    userId: user.id,
    wsId,
  });

  return (
    <CallShell
      defaultDisplayName={session.displayName}
      leaveHref={canReadWorkspace ? `/${wsId}/meetings/${meeting.id}` : '/'}
      canReadWorkspace={canReadWorkspace}
      meetingId={meeting.id}
      meetingName={meeting.name ?? t('untitled_meeting')}
      realtimeUrl={session.realtimeUrl}
      token={session.token}
      wsId={wsId}
    />
  );
}
