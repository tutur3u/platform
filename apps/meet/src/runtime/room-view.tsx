import { CallEnded } from '@tuturuuu/meet-core/features/call/components/call-ended';
import { CallShell } from '@tuturuuu/meet-core/features/call/components/device-session-gate';
import { MeetGuestJoin } from '@tuturuuu/meet-core/features/call/components/guest-join';
import { GuestVerificationProvider } from '@tuturuuu/meet-core/features/call/components/guest-verification-context';
import { ParticipantNameForm } from '@tuturuuu/meet-core/features/call/components/participant-name-form';
import { meetingDisplayName } from '@tuturuuu/meet-core/features/call/lib/meeting-display-name';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useTranslations } from 'next-intl';
import { MeetingNotesSection } from '@/features/meeting-notes/meeting-notes-section';
import type { MeetPageModel } from './page-model.server';
import {
  AccountRequiredInvite,
  MeetingPublicInvite,
} from './public-invite-view';

export function RoomView({
  model,
}: {
  model: Extract<
    MeetPageModel,
    { kind: 'room' | 'public-invite' | 'guest-join' | 'account-required' }
  >;
}) {
  const t = useTranslations('meet.call');
  if (model.kind === 'guest-join')
    return (
      <MeetGuestJoin
        meetingId={model.meetingId}
        meetingTitle={model.meetingTitle}
        returnTo={model.returnTo}
        siteKey={model.siteKey}
        miraBoxTickedByDefault={model.miraBoxTickedByDefault}
        miraAcceptanceRevision={model.miraAcceptanceRevision}
        meetUxV2={model.meetUxV2}
        // The server render reads the response nonce like the root head
        // scripts do; the browser never needs it again.
        scriptNonce={model.scriptNonce ?? globalThis.__meetCspNonce?.()}
      />
    );
  if (model.kind === 'public-invite')
    return (
      <MeetingPublicInvite
        info={model.publicInvite}
        returnTo={model.returnTo}
      />
    );
  if (model.kind === 'account-required')
    return <AccountRequiredInvite returnTo={model.returnTo} />;
  const { access, policy } = model;
  const { meeting, user, isHost, canReadWorkspace, workspaceSlug } = access;
  const requiresAccount = 'guest' in access && access.guest === true;
  const meetingName = meetingDisplayName(
    meeting.name,
    t('untitled_meeting')
  );
  const leaveHref = canReadWorkspace
    ? `/${workspaceSlug}/meetings/${meeting.id}`
    : '/';
  if (policy.ended)
    return (
      <WorkspaceVisibilityProvider actorId={user.id}>
        <CallEnded
          accountId={user.id}
          initialShowNotes={model.initialShowNotes}
          canManage={isHost}
          canReadNotes={policy.canReadNotes}
          canStartMeeting={canReadWorkspace}
          hostName={access.suggestedDisplayName}
          shareNotesAfterMeeting={policy.settings?.shareNotesAfterMeeting}
          meetingId={meeting.id}
          wsId={meeting.ws_id}
          meetingName={meetingName}
          backHref={canReadWorkspace ? `/${workspaceSlug}/meetings` : '/'}
          notes={
            <MeetingNotesSection
              wsId={meeting.ws_id}
              meetingId={meeting.id}
              title={meetingName}
              isHost={isHost}
              policy={policy}
              sharingControl={false}
            />
          }
        />
      </WorkspaceVisibilityProvider>
    );
  // With the redesigned flow the name is asked on the pre-join stage itself.
  const nameSetup =
    access.needsDisplayName && model.meetUxV2
      ? {
          initialName: access.suggestedDisplayName ?? '',
          siteKey: model.formsTurnstileSiteKey,
        }
      : undefined;
  if (access.needsDisplayName && !nameSetup)
    return (
      <ParticipantNameForm
        initialName={access.suggestedDisplayName ?? ''}
        meetingName={meetingName}
        leaveHref={leaveHref}
        siteKey={model.formsTurnstileSiteKey}
      />
    );
  const guestVerification =
    requiresAccount && model.formsTurnstileSiteKey
      ? {
          meetingId: meeting.id,
          siteKey: model.formsTurnstileSiteKey,
          verified:
            'turnstileVerified' in access && access.turnstileVerified === true,
        }
      : null;
  return (
    <WorkspaceVisibilityProvider actorId={user.id}>
      <GuestVerificationProvider value={guestVerification}>
        <CallShell
          accountId={user.id}
          defaultDisplayName={access.displayName}
          defaultAvatarUrl={access.avatarUrl}
          leaveHref={leaveHref}
          canReadWorkspace={canReadWorkspace}
          requiresAccount={requiresAccount}
          formsEnabled={model.formsEnabled}
          meetUxV2={model.meetUxV2}
          guestWhiteboard={model.guestWhiteboard}
          nameSetup={nameSetup}
          formsTurnstileSiteKey={model.formsTurnstileSiteKey}
          classroomToolsEnabled={model.classroomToolsEnabled}
          meetingId={meeting.id}
          meetingName={meetingName}
          wsId={meeting.ws_id}
        />
      </GuestVerificationProvider>
    </WorkspaceVisibilityProvider>
  );
}
