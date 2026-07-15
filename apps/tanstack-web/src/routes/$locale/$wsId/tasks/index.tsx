import { createFileRoute, notFound } from '@tanstack/react-router';
import MyTasksContent from '@tuturuuu/tasks-ui/tu-do/my-tasks/my-tasks-content';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  type ResolvedFullWorkspace,
  resolveFullWorkspace,
} from '../../../../lib/platform/workspace';

type MyTasksLoaderData = {
  userId: string;
  workspace: ResolvedFullWorkspace['workspace'];
};

export const Route = createFileRoute('/$locale/$wsId/tasks/')({
  component: MyTasksRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'View and manage your assigned tasks.',
      locale,
      title: 'My Tasks',
    });
  },
  loader: async ({ params }): Promise<MyTasksLoaderData> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    // The profile carries the user id MyTasksContent needs.
    const user = await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks`,
    });

    // Legacy getWorkspace() -> notFound() when missing/forbidden. MyTasksContent
    // needs `workspace.personal`, so resolve the FULL workspace row rather than
    // the id-only variant. Legacy MyTasksPage has NO permission gate.
    const workspace = await resolveFullWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    return { userId: user.id, workspace: workspace.workspace };
  },
});

function MyTasksRoutePage() {
  const data = Route.useLoaderData() as MyTasksLoaderData | undefined;

  if (!data) {
    throw notFound();
  }

  const { userId, workspace } = data;

  // Mirrors the legacy MyTasksDataLoader wrapper layout. MyTasksContent is a
  // shared `'use client'` component that self-loads its tasks via TanStack
  // Query (useMyTasksState / useAiCredits / useUserConfig); no server-passed
  // initial data is required. Its useTranslations('ws-tasks') namespace is
  // supplied by the $locale layout's IntlProvider. The client data fetches hit
  // an /api origin tanstack-web does not serve yet (the Phase-2 data-origin
  // gap shared by the other migrated dashboard routes).
  return (
    <div className="mx-auto mt-32 max-w-4xl space-y-4 md:space-y-6">
      <MyTasksContent
        wsId={workspace.id}
        userId={userId}
        isPersonal={workspace.personal ?? false}
      />
    </div>
  );
}
