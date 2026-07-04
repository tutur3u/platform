import { createFileRoute, notFound } from '@tanstack/react-router';
import PostsClient from '@/components/posts/client';
import { requireCurrentUser } from '../../../lib/platform/auth-gate';
import { createPageHead } from '../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../lib/platform/workspace';

export const Route = createFileRoute('/$locale/$wsId/posts')({
  component: PostsRoutePage,
  // Pass-through: PostsClient hosts nuqs `useQueryStates`, and the
  // NuqsAdapter reads `state.location.search`. Returning the raw record
  // (instead of narrowing to named keys) lets every posts query key —
  // including the array filters — round-trip through TanStack Router.
  validateSearch: (search: Record<string, unknown>) => search,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Posts in your Tuturuuu workspace.',
      locale,
      title: 'Posts',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy dashboard layout -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/posts`,
    });

    // Legacy getWorkspace() -> notFound() when missing. PostsClient self-loads
    // its own permissions via getWorkspacePostsPermissions, mirroring the
    // legacy page which gated only through the shared layout + client.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    return workspace;
  },
});

function PostsRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;
  const { locale } = Route.useParams();

  if (!workspace) {
    throw notFound();
  }

  // Initial searchParams seed is empty — every field is optional and the
  // client reads live state from the URL via nuqs, falling back to these.
  return (
    <PostsClient
      wsId={workspace.workspaceId}
      locale={locale}
      searchParams={{}}
    />
  );
}
