import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getWorkspace,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { IntegrationsPage } from '../../../components/integrations/integrations-page';
import { createPageHead } from '../../../lib/platform/head';
import {
  getMessages,
  resolveMessagesLocale,
} from '../../../lib/platform/messages';

type IntegrationsSearch = {
  reason?: string;
  sepay?: 'connected' | 'error';
};

type WorkspaceResolution =
  | {
      exists: false;
    }
  | {
      exists: true;
      workspaceId: string;
    };

type ResolvedWorkspace = Extract<WorkspaceResolution, { exists: true }>;

const legacyWorkspaceMissingStatuses = new Set([401, 403, 404]);

function validateIntegrationsSearch(
  search: Record<string, unknown>
): IntegrationsSearch {
  return {
    reason: typeof search.reason === 'string' ? search.reason : undefined,
    sepay:
      search.sepay === 'connected' || search.sepay === 'error'
        ? search.sepay
        : undefined,
  };
}

const resolveWorkspace = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string }) => data)
  .handler(async ({ data }): Promise<WorkspaceResolution> => {
    try {
      const workspace = await getWorkspace(
        data.wsId,
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      if (!workspace?.id) {
        return { exists: false };
      }

      return {
        exists: true,
        workspaceId: workspace.id,
      };
    } catch (error) {
      if (
        error instanceof InternalApiError &&
        (legacyWorkspaceMissingStatuses.has(error.status) ||
          (error.status === 500 &&
            error.message === 'Error fetching workspaces'))
      ) {
        return { exists: false };
      }

      throw error;
    }
  });

export const Route = createFileRoute('/$locale/$wsId/integrations')({
  component: IntegrationsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Integrations in your Tuturuuu workspace.',
      locale,
      title: 'Integrations',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    const workspace = await resolveWorkspace({
      data: {
        wsId: params.wsId,
      },
    });

    if (!workspace.exists) {
      throw notFound();
    }

    return workspace;
  },
  validateSearch: validateIntegrationsSearch,
});

function IntegrationsRoutePage() {
  const { locale } = Route.useParams();
  const search = Route.useSearch();
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;

  if (!workspace) {
    throw notFound();
  }

  return (
    <IntegrationsPage
      messages={getMessages(locale)}
      search={search}
      workspaceId={workspace.workspaceId}
    />
  );
}
