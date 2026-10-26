import { SatelliteWorkspaceInvitationCard } from '@tuturuuu/satellite/workspace-invitation';
import { useTranslations } from 'next-intl';
import { lazy, Suspense } from 'react';
import { MeetingsContent } from '../app/[locale]/[wsId]/meetings/meetings-content';
import type { MeetPageModel } from './page-model.server';
import { PlansView } from './plans-view';
import { PublicLayout } from './public-layout';
import { Pending } from './router-shell';
import VerifyTokenPage from './verify-token-page';
import { WorkspaceView } from './workspace-view';

// The call shell, collaboration editors, live plan editor and meeting detail
// pull in realtime, rich-text and code-editor dependencies. Loading them on
// demand keeps the workspace lists and the public shell on a small bundle;
// the server still renders them, and hydration waits for the chunk instead of
// replacing the server markup.
const RoomView = lazy(() =>
  import('./room-view').then((module) => ({ default: module.RoomView }))
);
const NativeCollaboration = lazy(() =>
  import('../features/call/components/native-collaboration').then((module) => ({
    default: module.NativeCollaboration,
  }))
);
const PlanLiveView = lazy(() => import('./plan-live-view'));
const MeetingView = lazy(() =>
  import('./meeting-view').then((module) => ({ default: module.MeetingView }))
);

export function PageView({ model }: { model: MeetPageModel }) {
  const t = useTranslations('meet.call');
  switch (model.kind) {
    case 'verify-token':
      return <VerifyTokenPage />;
    case 'native-collaboration':
      return (
        <Suspense>
          <NativeCollaboration />
        </Suspense>
      );
    case 'public-invite':
    case 'room':
      return (
        <Suspense fallback={<Pending />}>
          <RoomView model={model} />
        </Suspense>
      );
    case 'plan':
      return (
        <Suspense fallback={<Pending />}>
          <PlanLiveView model={model} />
        </Suspense>
      );
    case 'public-plans':
      return (
        <PublicLayout>
          <PlansView model={model} />
        </PublicLayout>
      );
    case 'workspace-invitation':
      return (
        <SatelliteWorkspaceInvitationCard
          afterDeclineHref="/"
          invitation={model.workspace.invitation}
          workspaceHref={`/${model.workspace.invitation.workspace.id}`}
        />
      );
    case 'workspace-plans':
      return (
        <WorkspaceView workspace={model.workspace} locale={model.locale}>
          <div className="-m-4">
            <PlansView model={model} />
          </div>
        </WorkspaceView>
      );
    case 'meeting':
      return (
        <WorkspaceView workspace={model.workspace} locale={model.locale}>
          <Suspense fallback={null}>
            <MeetingView model={model} />
          </Suspense>
        </WorkspaceView>
      );
    case 'meetings':
      return (
        <WorkspaceView workspace={model.workspace} locale={model.locale}>
          <div className="container mx-auto max-w-7xl p-6">
            <div className="mb-8">
              <h1 className="font-bold text-3xl tracking-tight">
                {t('meetings_title')}
              </h1>
              <p className="text-muted-foreground">
                {t('meetings_description')}
              </p>
            </div>
            {!model.hosting.canCreate && (
              <p
                className="mb-6 rounded-xl border bg-muted/30 p-4 text-muted-foreground text-sm"
                role={model.hosting.unavailable ? 'alert' : undefined}
              >
                {t(
                  model.hosting.unavailable
                    ? 'hosting_unavailable'
                    : 'creation_restricted'
                )}
              </p>
            )}
            <MeetingsContent
              accountId={model.workspace.user.id}
              wsId={model.workspace.wsId}
              {...model.paging}
              canCreate={model.hosting.canCreate}
            />
          </div>
        </WorkspaceView>
      );
    default: {
      const unreachable: never = model;
      return unreachable;
    }
  }
}
