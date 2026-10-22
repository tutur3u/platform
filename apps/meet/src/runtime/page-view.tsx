import VerifyTokenPage from '@tuturuuu/satellite/verify-token-page';
import { SatelliteWorkspaceInvitationCard } from '@tuturuuu/satellite/workspace-invitation';
import { MeetPlanLiveRoot } from '@tuturuuu/ui/legacy/meet/planId/meet-plan-live-root';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { MeetingsContent } from '../app/[locale]/[wsId]/meetings/meetings-content';
import { BASE_URL } from '../constants/common';
import { NativeCollaboration } from '../features/call/components/native-collaboration';
import { MeetingView } from './meeting-view';
import type { MeetPageModel } from './page-model.server';
import { PlansView } from './plans-view';
import { PublicLayout } from './public-layout';
import { RoomView } from './room-view';
import { WorkspaceView } from './workspace-view';

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
      return <RoomView model={model} />;
    case 'plan':
      return (
        <PublicLayout>
          <div className="flex min-h-screen w-full flex-col items-center">
            <MeetPlanLiveRoot
              platformUser={model.profile}
              baseUrl={BASE_URL}
              initialSnapshot={model.snapshot}
            />
          </div>
        </PublicLayout>
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
          <MeetingView model={model} />
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
