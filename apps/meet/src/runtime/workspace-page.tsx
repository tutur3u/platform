import { useTranslations } from 'next-intl';
import { lazy, Suspense } from 'react';
import { MeetingsContent } from '../app/[locale]/[wsId]/meetings/meetings-content';
import type { MeetPageModel } from './page-model.server';
import { PlansView } from './plans-view';
import { WorkspaceView } from './workspace-view';

const MeetingView = lazy(() =>
  import('./meeting-view').then((module) => ({ default: module.MeetingView }))
);

export type WorkspacePageModel = Extract<
  MeetPageModel,
  { kind: 'workspace-plans' | 'meeting' | 'meetings' }
>;

/**
 * The signed-in workspace shell and its list views. They share the sidebar,
 * Supabase client, forms and date pickers, so they load as one chunk that the
 * room, plan and public pages never download.
 */
export default function WorkspacePage({
  model,
}: {
  model: WorkspacePageModel;
}) {
  const t = useTranslations('meet.call');
  switch (model.kind) {
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
