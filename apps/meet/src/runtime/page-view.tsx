import { lazy, Suspense } from 'react';
import type { MeetPageModel } from './page-model.server';
import { PublicLayout } from './public-layout';
import { Pending } from './router-shell';

// Every view loads on demand, so a page only downloads its own dependencies:
// the call shell, collaboration editors, live plan editor, the workspace shell
// (sidebar, Supabase client, forms, date pickers) and the plan lists each sit
// in their own chunk. The server still renders them, and hydration waits for
// the chunk instead of replacing the server markup.
const RoomView = lazy(() =>
  import('./room-view').then((module) => ({ default: module.RoomView }))
);
const NativeCollaboration = lazy(() =>
  import('../features/call/components/native-collaboration').then((module) => ({
    default: module.NativeCollaboration,
  }))
);
const PlanLiveView = lazy(() => import('./plan-live-view'));
const WorkspacePage = lazy(() => import('./workspace-page'));
const PlansView = lazy(() =>
  import('./plans-view').then((module) => ({ default: module.PlansView }))
);
const VerifyTokenPage = lazy(
  () => import('@tuturuuu/satellite/verify-token-page')
);
const WorkspaceInvitationCard = lazy(() =>
  import('@tuturuuu/satellite/workspace-invitation/card').then((module) => ({
    default: module.SatelliteWorkspaceInvitationCard,
  }))
);

export function PageView({ model }: { model: MeetPageModel }) {
  switch (model.kind) {
    case 'verify-token':
      return (
        <Suspense fallback={<Pending />}>
          <VerifyTokenPage />
        </Suspense>
      );
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
          <Suspense fallback={<Pending />}>
            <PlansView model={model} />
          </Suspense>
        </PublicLayout>
      );
    case 'workspace-invitation':
      return (
        <Suspense fallback={<Pending />}>
          <WorkspaceInvitationCard
            afterDeclineHref="/"
            invitation={model.workspace.invitation}
            workspaceHref={`/${model.workspace.invitation.workspace.id}`}
          />
        </Suspense>
      );
    case 'workspace-plans':
    case 'meeting':
    case 'meetings':
      return (
        <Suspense fallback={<Pending />}>
          <WorkspacePage model={model} />
        </Suspense>
      );
    default: {
      const unreachable: never = model;
      return unreachable;
    }
  }
}
