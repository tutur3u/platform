import { CallEnded } from '@tuturuuu/meet-core/features/call/components/call-ended';
import { CallShell } from '@tuturuuu/meet-core/features/call/components/device-session-gate';
import { MeetGuestJoin } from '@tuturuuu/meet-core/features/call/components/guest-join';
import { GuestVerificationProvider } from '@tuturuuu/meet-core/features/call/components/guest-verification-context';
import { ParticipantNameForm } from '@tuturuuu/meet-core/features/call/components/participant-name-form';
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
  const meetingName = meeting.name ?? t('untitled_meeting');
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
  if (access.needsDisplayName)
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
