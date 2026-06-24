import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type ListWorkspaceDocumentsResponse,
  listAllWorkspaceDocuments,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { WorkspaceDocumentsPage } from '@/components/documents/workspace-documents-page';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { requireWorkspacePermission } from '@/lib/platform/workspace-permission';

type DocumentsRouteData = {
  documents: ListWorkspaceDocumentsResponse;
  routeWorkspaceId: string;
  workspaceId: string;
};

const loadWorkspaceDocuments = createServerFn({ method: 'GET' })
  .validator((data: { workspaceId: string }) => data)
  .handler(async ({ data }) =>
    listAllWorkspaceDocuments(
      data.workspaceId,
      {},
      withForwardedInternalApiAuth(getRequestHeaders())
    )
  );

export const Route = createFileRoute('/$locale/$wsId/documents')({
  component: DocumentsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Documents in your Tuturuuu workspace.',
      locale,
      title: 'Documents',
    });
  },
  loader: async ({ params }): Promise<DocumentsRouteData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/documents`,
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

    const documents = await loadWorkspaceDocuments({
      data: { workspaceId: workspace.workspaceId },
    });

    return {
      documents,
      routeWorkspaceId: params.wsId,
      workspaceId: workspace.workspaceId,
    };
  },
});

function DocumentsRoutePage() {
  const data = Route.useLoaderData() as DocumentsRouteData | undefined;
  const { locale } = Route.useParams();

  if (!data) {
    throw notFound();
  }

  return (
    <WorkspaceDocumentsPage
      initialDocuments={data.documents}
      locale={locale}
      routeWorkspaceId={data.routeWorkspaceId}
      workspaceId={data.workspaceId}
    />
  );
}
