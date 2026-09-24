import { CallEnded } from '@tuturuuu/meet-core/features/call/components/call-ended';
import { CallShell } from '@tuturuuu/meet-core/features/call/components/device-session-gate';
import { MeetingPublicInvite } from '@tuturuuu/meet-core/features/call/components/meeting-public-invite';
import { ParticipantNameForm } from '@tuturuuu/meet-core/features/call/components/participant-name-form';
import {
  getMeetCallAccess,
  MeetCallAccessError,
} from '@tuturuuu/meet-core/features/call/lib/call-access';
import { meetingMetadata } from '@tuturuuu/meet-core/features/call/lib/meeting-metadata';
import { getMeetingPublicInfo } from '@tuturuuu/meet-core/features/call/lib/meeting-public-info';
import { decodeRoomCode } from '@tuturuuu/meet-core/features/call/lib/room-code';
import { readMeetingRoomPolicy } from '@tuturuuu/meet-core/features/meeting-ai/server/room-access';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: RoomPageProps): Promise<Metadata> {
  await connection();
  const { code, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meet.public' });
  return meetingMetadata(code, locale, await getMeetingPublicInfo(code), {
    title: t('meta_title'),
    privateDescription: t('meta_private'),
    join: t('meta_join'),
    ended: t('meta_ended'),
  });
}

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
    async (error: unknown) => {
      if (error instanceof MeetCallAccessError) {
        if (error.status === 401) {
          const invite = `${locale === 'en' ? '' : `/${locale}`}/r/${code}`;
          const info = await getMeetingPublicInfo(code);
          if (info) return { publicInvite: info, returnTo: invite };
          redirect(`/login?next=${encodeURIComponent(invite)}`);
        }
        if (error.status === 403 || error.status === 404) notFound();
      }
      throw error;
    }
  );
  if ('publicInvite' in access)
    return (
      <MeetingPublicInvite
        info={access.publicInvite}
        returnTo={access.returnTo}
      />
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
  const leaveHref =
    MEETING_APP !== 'parley' && canReadWorkspace
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
        accountId={user.id}
        initialShowNotes={(await searchParams)?.notes === '1'}
        canManage={isHost}
        canReadNotes={policy.canReadNotes}
        shareNotesAfterMeeting={policy.settings?.shareNotesAfterMeeting}
        meetingId={meetingId}
        wsId={wsId}
        meetingName={meeting.name ?? t('untitled_meeting')}
        backHref={
          MEETING_APP !== 'parley' && canReadWorkspace
            ? `/${workspaceSlug}/meetings`
            : '/'
        }
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
      accountId={user.id}
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
