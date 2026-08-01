import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { CallShell } from '@/features/call/components/call-shell';
import { getMeetCallSession } from '@/features/call/lib/call-session';
import { decodeRoomCode } from '@/features/call/lib/room-code';
import { getMeetWorkspaceContext } from '../../[wsId]/workspace-context';

export const metadata: Metadata = {
  title: 'Call',
  description: 'Join a Tuturuuu Meet call.',
};

interface RoomPageProps {
  params: Promise<{ code: string }>;
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

  const { code } = await params;
  const meetingId = decodeRoomCode(code);
  if (!meetingId) notFound();

  const supabase = await createAdminClient({ noCookie: true });
  const { data: meeting } = await supabase
    .from('workspace_meetings')
    .select('id, name, creator_id, ws_id')
    .eq('id', meetingId)
    .maybeSingle();

  if (!meeting) notFound();

  const t = await getTranslations('meet.call');
  // Enforces membership and redirects non-members away.
  const { user, workspaceSlug, wsId } = await getMeetWorkspaceContext(
    meeting.ws_id
  );

  const profile = user as {
    display_name?: string | null;
    email?: string | null;
    full_name?: string | null;
  };
  const displayName: string =
    profile.display_name || profile.full_name || profile.email || t('guest');

  const session = await getMeetCallSession({
    displayName,
    isHost: meeting.creator_id === user.id,
    meetingId: meeting.id,
    userId: user.id,
    wsId,
  });

  return (
    <CallShell
      defaultDisplayName={session.displayName}
      leaveHref={`/${workspaceSlug}/meetings/${meeting.id}`}
      meetingId={meeting.id}
      meetingName={meeting.name ?? t('untitled_meeting')}
      realtimeUrl={session.realtimeUrl}
      token={session.token}
      wsId={wsId}
    />
  );
}
