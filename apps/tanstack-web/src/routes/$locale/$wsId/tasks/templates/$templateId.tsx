import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import {
  getWorkspaceTemplate,
  getWorkspaceTemplateBackgroundUrl,
} from '@tuturuuu/internal-api/templates';
import TaskTemplateDetailPageClient from '@tuturuuu/ui/tu-do/templates/templateId/task-template-detail-page-client';
import { requireCurrentUser } from '../../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../../lib/platform/messages';
import { resolveWorkspace } from '../../../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../../../lib/platform/workspace-permission';

const TEMPLATES_BASE_PATH = 'tasks/templates';

// Legacy gate validates the templateId is a canonical UUID before any fetch.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

type WorkspaceTemplate = Awaited<ReturnType<typeof getWorkspaceTemplate>>;

type TemplateLoaderData = {
  initialBackgroundUrl: string | null;
  initialTemplate: WorkspaceTemplate;
  templateId: string;
  wsId: string;
};

/**
 * Forwarded-auth data load for the template detail page. Mirrors the legacy
 * shared component: fetch the template (RLS-respecting), then resolve its
 * signed background URL only when a background path exists. Returns `null` when
 * the template cannot be fetched so the loader maps it to a not-found, matching
 * the legacy `catch -> notFound()`.
 */
const loadTemplate = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string; templateId: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<{
      initialBackgroundUrl: string | null;
      initialTemplate: WorkspaceTemplate;
    } | null> => {
      const options = withForwardedInternalApiAuth(getRequestHeaders());

      let initialTemplate: WorkspaceTemplate;
      try {
        initialTemplate = await getWorkspaceTemplate(
          data.wsId,
          data.templateId,
          options
        );
      } catch {
        return null;
      }

      let initialBackgroundUrl: string | null = null;
      if (initialTemplate.backgroundPath) {
        try {
          initialBackgroundUrl = await getWorkspaceTemplateBackgroundUrl(
            data.wsId,
            data.templateId,
            options
          );
        } catch {
          initialBackgroundUrl = null;
        }
      }

      return { initialBackgroundUrl, initialTemplate };
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/tasks/templates/$templateId'
)({
  component: TemplateDetailRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'View and use this board template in your workspace.',
      locale,
      title: 'Board Template',
    });
  },
  loader: async ({ params }): Promise<TemplateLoaderData> => {
    // Legacy validates the templateId is a UUID up front -> notFound().
    if (!isUuid(params.templateId)) {
      throw notFound();
    }

    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/templates/${params.templateId}`,
    });

    // Legacy getWorkspace() -> notFound().
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy withoutPermission('manage_projects') -> redirect(`/${wsId}`).
    await requireWorkspacePermission({
      wsId: workspace.workspaceId,
      permission: 'manage_projects',
      locale: params.locale,
    });

    // Functional data-backed load via forwarded-auth readers (not a Phase-2
    // shell): the template + signed background URL resolve server-side.
    const loaded = await loadTemplate({
      data: { wsId: workspace.workspaceId, templateId: params.templateId },
    });
    if (!loaded) {
      throw notFound();
    }

    return {
      initialBackgroundUrl: loaded.initialBackgroundUrl,
      initialTemplate: loaded.initialTemplate,
      templateId: params.templateId,
      wsId: workspace.workspaceId,
    };
  },
});

function TemplateDetailRoutePage() {
  const data = Route.useLoaderData() as TemplateLoaderData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <TaskTemplateDetailPageClient
      initialBackgroundUrl={data.initialBackgroundUrl}
      initialTemplate={data.initialTemplate}
      templateId={data.templateId}
      templatesBasePath={TEMPLATES_BASE_PATH}
      wsId={data.wsId}
    />
  );
}
