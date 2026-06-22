import { createFileRoute, notFound } from '@tanstack/react-router';
import NotesContent from '@tuturuuu/ui/tu-do/notes/notes-content';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../../lib/platform/workspace';

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
