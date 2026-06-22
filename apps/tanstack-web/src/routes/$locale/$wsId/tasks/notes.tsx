import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getWorkspace,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import NotesContent from '@tuturuuu/ui/tu-do/notes/notes-content';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';

type WorkspaceResolution =
  | { exists: false }
  | { exists: true; workspaceId: string };

type ResolvedWorkspace = Extract<WorkspaceResolution, { exists: true }>;

const legacyWorkspaceMissingStatuses = new Set([401, 403, 404]);

/**
 * Faithful port of the shared NotesPage server component (apps/web): resolve the
 * workspace under the authenticated user's forwarded auth (RLS-respecting),
 * treating the legacy missing-workspace statuses as notFound. Mirrors the
 * resolveWorkspace shape used by the migrated integrations route.
 */
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

      return { exists: true, workspaceId: workspace.id };
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

export const Route = createFileRoute('/$locale/$wsId/tasks/notes')({
  component: NotesRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Capture quick notes and ideas in your Tuturuuu workspace.',
      locale,
      title: 'Notes',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/notes`,
    });

    // Legacy getWorkspace() -> notFound() when missing/forbidden.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });

    if (!workspace.exists) {
      throw notFound();
    }

    return workspace;
  },
});

function NotesRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;

  if (!workspace) {
    throw notFound();
  }

  // NotesContent calls useTranslations('dashboard.bucket_dump'); the next-intl
  // provider in the $locale layout supplies the messages so this shared client
  // component renders without a per-component fork.
  return <NotesContent wsId={workspace.workspaceId} />;
}
