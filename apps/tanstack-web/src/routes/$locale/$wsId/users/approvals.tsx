import { createFileRoute, notFound } from '@tanstack/react-router';
import { Info } from '@tuturuuu/icons';
import { useTranslations } from 'use-intl';
import { ApprovalsClient } from '../../../../components/users/approvals/approvals-client';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveFullWorkspace } from '../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type ApprovalsLoaderData = {
  canApprovePosts: boolean;
  canApproveReports: boolean;
  isPersonal: boolean;
  workspaceId: string;
};

export const Route = createFileRoute('/$locale/$wsId/users/approvals')({
  component: ApprovalsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Review and approve user reports and posts.',
      locale,
      title: 'Approvals',
    });
  },
  loader: async ({ params }): Promise<ApprovalsLoaderData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/users/approvals`,
    });

    // Legacy getWorkspace() -> notFound() when missing.
    const workspace = await resolveFullWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy: personal workspaces render an inline "not available" notice.
    if (workspace.workspace.personal) {
      return {
        canApprovePosts: false,
        canApproveReports: false,
        isPersonal: true,
        workspaceId: workspace.workspace.id,
      };
    }

    const [canApproveReports, canApprovePosts] = await Promise.all([
      hasWorkspacePermission({
        data: { permission: 'approve_reports', wsId: workspace.workspace.id },
      }),
      hasWorkspacePermission({
        data: { permission: 'approve_posts', wsId: workspace.workspace.id },
      }),
    ]);

    // Legacy: neither approve permission -> notFound().
    if (!canApproveReports && !canApprovePosts) {
      throw notFound();
    }

    return {
      canApprovePosts,
      canApproveReports,
      isPersonal: false,
      workspaceId: workspace.workspace.id,
    };
  },
});

function ApprovalsRoutePage() {
  const data = Route.useLoaderData() as ApprovalsLoaderData | undefined;
  const t = useTranslations('approvals');

  if (!data) {
    throw notFound();
  }

  if (data.isPersonal) {
    return (
      <div className="container mx-auto px-4 py-6 md:px-8">
        <div className="rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 p-4">
          <div className="flex">
            <div className="shrink-0">
              <Info aria-hidden="true" className="h-5 w-5 text-dynamic-blue" />
            </div>
            <div className="ml-3">
              <h3 className="font-medium text-dynamic-blue text-sm">
                {t('personal.title')}
              </h3>
              <p className="mt-1 text-dynamic-blue text-sm">
                {t('personal.description')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 md:px-8">
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>
      <div className="mt-6">
        <ApprovalsClient
          canApprovePosts={data.canApprovePosts}
          canApproveReports={data.canApproveReports}
          wsId={data.workspaceId}
        />
      </div>
    </div>
  );
}
