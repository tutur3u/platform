import { CallEnded } from '@tuturuuu/meet-core/features/call/components/call-ended';
import { CallShell } from '@tuturuuu/meet-core/features/call/components/device-session-gate';
import { ParticipantNameForm } from '@tuturuuu/meet-core/features/call/components/participant-name-form';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useTranslations } from 'next-intl';
import type { MeetPageModel } from './page-model.server';
import { MeetingPublicInvite } from './public-invite-view';

export function RoomView({
  model,
}: {
  model: Extract<MeetPageModel, { kind: 'room' | 'public-invite' }>;
}) {
  const t = useTranslations('meet.call');
  if (model.kind === 'public-invite')
    return (
      <MeetingPublicInvite
        info={model.publicInvite}
        returnTo={model.returnTo}
      />
    );
  const { access, policy } = model;
  const { meeting, user, isHost, canReadWorkspace, workspaceSlug } = access;
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
          shareNotesAfterMeeting={policy.settings?.shareNotesAfterMeeting}
          meetingId={meeting.id}
          wsId={meeting.ws_id}
          meetingName={meetingName}
          backHref={canReadWorkspace ? `/${workspaceSlug}/meetings` : '/'}
        />
      </WorkspaceVisibilityProvider>
    );
  if (access.needsDisplayName)
    return (
      <ParticipantNameForm
        initialName={access.suggestedDisplayName ?? ''}
        meetingName={meetingName}
        leaveHref={leaveHref}
      />
    );
  return (
    <WorkspaceVisibilityProvider actorId={user.id}>
      <CallShell
        accountId={user.id}
        defaultDisplayName={access.displayName}
        defaultAvatarUrl={access.avatarUrl}
        leaveHref={leaveHref}
        canReadWorkspace={canReadWorkspace}
        meetingId={meeting.id}
        meetingName={meetingName}
        wsId={meeting.ws_id}
      />
    </WorkspaceVisibilityProvider>
  );
}
