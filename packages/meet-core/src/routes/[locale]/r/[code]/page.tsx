import { CallEnded } from '@tuturuuu/meet-core/features/call/components/call-ended';
import { MeetGuestJoin } from '@tuturuuu/meet-core/features/call/components/guest-join';
import {
  readMiraBoxTickedByDefaultForMeeting,
  readOpenMiraAcceptanceRevision,
} from '@tuturuuu/meet-core/features/live-assistant/server/room-mira-evidence';
import { CallShell } from '@tuturuuu/meet-core/features/call/components/device-session-gate';
import { isMeetFormsEnabled } from '@tuturuuu/meet-core/features/call/server/forms/enabled';
import { isMeetUxV2Enabled } from '@tuturuuu/meet-core/features/call/server/ux-v2';
import {
  AccountRequiredInvite,
  MeetingPublicInvite,
} from '@tuturuuu/meet-core/features/call/components/meeting-public-invite';
import { ParticipantNameForm } from '@tuturuuu/meet-core/features/call/components/participant-name-form';
import {
  getMeetCallAccess,
  MeetCallAccessError,
} from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  getMeetGuestCallAccess,
  meetGuestTurnstileSiteKey,
  resolveMeetGuestJoin,
} from '@tuturuuu/meet-core/features/call/lib/guest-access';
import { MEET_GUEST_COOKIE } from '@tuturuuu/meet-core/features/call/lib/guest-session';
import { buildMeetSeo } from '@tuturuuu/meet-core/features/call/lib/seo/metadata';
import { meetSeoToNextMetadata } from '@tuturuuu/meet-core/features/call/lib/seo/next-metadata';
import { meetingDisplayName } from '@tuturuuu/meet-core/features/call/lib/meeting-display-name';
import { getMeetingPublicInfo } from '@tuturuuu/meet-core/features/call/lib/meeting-public-info';
import { decodeRoomCode } from '@tuturuuu/meet-core/features/call/lib/room-code';
import { readMeetingRoomPolicy } from '@tuturuuu/meet-core/features/meeting-ai/server/room-access';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: RoomPageProps): Promise<Metadata> {
  await connection();
  const { code, locale } = await params;
  const info = await getMeetingPublicInfo(code);
  return meetSeoToNextMetadata(
    buildMeetSeo({ kind: 'room', code, info }, locale)
  );
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
          const guest = await getMeetGuestCallAccess(
            meetingId,
            (await cookies()).get(MEET_GUEST_COOKIE)?.value
          );
          if (guest) return guest;
          const invite = `${locale === 'en' ? '' : `/${locale}`}/r/${code}`;
          const info = await getMeetingPublicInfo(code);
          const siteKey = meetGuestTurnstileSiteKey();
          if (
            siteKey &&
            (await resolveMeetGuestJoin(meetingId)).kind === 'available'
          )
            return {
              guestJoin: {
                siteKey,
                title: info?.title,
                miraBoxTickedByDefault:
                  await readMiraBoxTickedByDefaultForMeeting(meetingId),
                miraAcceptanceRevision:
                  await readOpenMiraAcceptanceRevision(meetingId),
              },
              returnTo: invite,
            };
          if (info) return { publicInvite: info, returnTo: invite };
          return { accountRequired: invite };
        }
        if (error.status === 403 || error.status === 404) notFound();
      }
      throw error;
    }
  );
  if ('guestJoin' in access && access.guestJoin)
    return (
      <MeetGuestJoin
        meetingId={meetingId}
        meetingTitle={access.guestJoin.title}
        returnTo={access.returnTo}
        siteKey={access.guestJoin.siteKey}
        miraBoxTickedByDefault={access.guestJoin.miraBoxTickedByDefault}
        miraAcceptanceRevision={access.guestJoin.miraAcceptanceRevision}
        meetUxV2={isMeetUxV2Enabled()}
      />
    );
  if ('publicInvite' in access && access.publicInvite)
    return (
      <MeetingPublicInvite
        info={access.publicInvite}
        returnTo={access.returnTo}
      />
    );
  if ('accountRequired' in access)
    return <AccountRequiredInvite returnTo={access.accountRequired} />;
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
  const meetingName = meetingDisplayName(
    meeting.name,
    t('untitled_meeting')
  );
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
      <WorkspaceVisibilityProvider actorId={user.id}>
        <CallEnded
          accountId={user.id}
          initialShowNotes={(await searchParams)?.notes === '1'}
          canManage={isHost}
          canReadNotes={policy.canReadNotes}
          canStartMeeting={MEETING_APP !== 'parley' && canReadWorkspace}
          hostName={access.suggestedDisplayName}
          shareNotesAfterMeeting={policy.settings?.shareNotesAfterMeeting}
          meetingId={meetingId}
          wsId={wsId}
          meetingName={meetingName}
          backHref={
            MEETING_APP !== 'parley' && canReadWorkspace
              ? `/${workspaceSlug}/meetings`
              : '/'
          }
        />
      </WorkspaceVisibilityProvider>
    );
  const meetUxV2 = isMeetUxV2Enabled();
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  // With the redesigned flow the name is asked on the pre-join stage itself.
  const nameSetup =
    access.needsDisplayName && meetUxV2
      ? {
          initialName: access.suggestedDisplayName ?? '',
          siteKey: turnstileSiteKey,
        }
      : undefined;
  if (access.needsDisplayName && !nameSetup)
    return (
      <ParticipantNameForm
        initialName={access.suggestedDisplayName ?? ''}
        meetingName={meetingName}
        leaveHref={leaveHref}
        siteKey={turnstileSiteKey}
      />
    );

  return (
    <WorkspaceVisibilityProvider actorId={user.id}>
      <CallShell
        formsEnabled={isMeetFormsEnabled()}
        formsTurnstileSiteKey={turnstileSiteKey}
        meetUxV2={meetUxV2}
        nameSetup={nameSetup}
        accountId={user.id}
        defaultDisplayName={displayName}
        defaultAvatarUrl={avatarUrl}
        leaveHref={leaveHref}
        canReadWorkspace={canReadWorkspace}
        meetingId={meeting.id}
        meetingName={meetingName}
        wsId={wsId}
      />
    </WorkspaceVisibilityProvider>
  );
}
