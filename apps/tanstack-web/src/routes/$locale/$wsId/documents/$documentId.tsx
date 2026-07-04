import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getWorkspaceDocument,
  InternalApiError,
  type WorkspaceDocumentDetail,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { WorkspaceDocumentDetailPage } from '@/components/documents/workspace-document-detail-page';
import {
  getWorkspaceNextPath,
  requireCurrentUser,
} from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { requireWorkspacePermission } from '@/lib/platform/workspace-permission';

type DocumentDetailRouteData = {
  document: WorkspaceDocumentDetail;
  routeWorkspaceId: string;
  workspaceId: string;
};

const loadWorkspaceDocument = createServerFn({ method: 'GET' })
  .validator((data: { documentId: string; workspaceId: string }) => data)
  .handler(async ({ data }) =>
    getWorkspaceDocument(
      data.workspaceId,
      data.documentId,
      withForwardedInternalApiAuth(getRequestHeaders())
    )
  );

export const Route = createFileRoute('/$locale/$wsId/documents/$documentId')({
  component: DocumentDetailRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Preview a workspace document in Tuturuuu.',
      locale,
      title: 'Document',
    });
  },
  loader: async ({ location, params }): Promise<DocumentDetailRouteData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(
        params,
        location.pathname,
        `documents/${params.documentId}`
      ),
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    await requireWorkspacePermission({
      locale: params.locale,
      permission: 'manage_documents',
      wsId: workspace.workspaceId,
    });

    try {
      const response = await loadWorkspaceDocument({
        data: {
          documentId: params.documentId,
          workspaceId: workspace.workspaceId,
        },
      });

      return {
        document: response.data,
        routeWorkspaceId: params.wsId,
        workspaceId: workspace.workspaceId,
      };
    } catch (error) {
      if (error instanceof InternalApiError && error.status === 404) {
        throw notFound();
      }

      throw error;
    }
  },
});

function DocumentDetailRoutePage() {
  const { locale } = Route.useParams();
  const data = Route.useLoaderData() as DocumentDetailRouteData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <WorkspaceDocumentDetailPage
      document={data.document}
      locale={locale}
      routeWorkspaceId={data.routeWorkspaceId}
    />
  );
}
