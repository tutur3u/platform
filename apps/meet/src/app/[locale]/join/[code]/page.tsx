import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { decodeRoomCode } from '@/features/call/lib/room-code';
import { getMeetWorkspaceContext } from '../../workspace/[wsId]/workspace-context';

export const metadata: Metadata = {
  title: 'Join meeting',
  description: 'Join a Tuturuuu Meet call with a meeting code.',
};

interface JoinPageProps {
  params: Promise<{ code: string }>;
}

/**
 * Resolves a shareable meeting code to its call.
 *
 * The code encodes the meeting id, so an invalid code is rejected before any
 * query runs. Workspace membership is still enforced by
 * `getMeetWorkspaceContext`, which means a code is a convenience for sharing
 * inside a workspace, not a bypass around access control.
 */
export default async function JoinPage({ params }: JoinPageProps) {
  await connection();

  const { code } = await params;
  const meetingId = decodeRoomCode(code);
  if (!meetingId) notFound();

  const supabase = await createAdminClient({ noCookie: true });
  const { data: meeting } = await supabase
    .from('workspace_meetings')
    .select('id, ws_id')
    .eq('id', meetingId)
    .maybeSingle();

  if (!meeting) notFound();

  // Resolves the caller's access to this workspace and redirects them out if
  // they are not a member.
  const { workspaceSlug } = await getMeetWorkspaceContext(meeting.ws_id);

  redirect(`/call/${workspaceSlug}/${meeting.id}`);
}
