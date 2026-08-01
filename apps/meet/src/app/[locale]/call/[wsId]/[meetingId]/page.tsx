import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { CallShell } from '@/features/call/components/call-shell';
import { getMeetCallSession } from '@/features/call/lib/call-session';
import { getMeetWorkspaceContext } from '../../../workspace/[wsId]/workspace-context';

export const metadata: Metadata = {
  title: 'Call',
  description: 'Join a Tuturuuu Meet call.',
};

interface CallPageProps {
  params: Promise<{ meetingId: string; wsId: string }>;
}

/**
 * Deliberately outside the `workspace/` segment so the call renders full-bleed
 * with no sidebar or chrome, the way a conferencing surface should.
 */
export default async function CallPage({ params }: CallPageProps) {
  await connection();

  const { meetingId, wsId: rawWsId } = await params;
  const { user, workspaceSlug, wsId } = await getMeetWorkspaceContext(rawWsId);
  const t = await getTranslations('meet.call');

  const supabase = await createAdminClient({ noCookie: true });
  const { data: meeting } = await supabase
    .from('workspace_meetings')
    .select('id, name, creator_id, ws_id')
    .eq('id', meetingId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (!meeting) notFound();

  // The session user is a union: the minimal app-session branch only carries
  // an id and an email, so the richer profile fields are read optionally.
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
      leaveHref={`/workspace/${workspaceSlug}/meetings/${meeting.id}`}
      meetingId={meeting.id}
      meetingName={meeting.name ?? t('untitled_meeting')}
      realtimeUrl={session.realtimeUrl}
      token={session.token}
      wsId={wsId}
    />
  );
}
