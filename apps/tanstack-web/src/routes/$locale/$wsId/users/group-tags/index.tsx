import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type ListWorkspaceGroupTagsResponse,
  listWorkspaceGroupTags,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { UserGroupTag } from '@tuturuuu/types/primitives/UserGroupTag';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { groupTagColumns } from '@/components/users/group-tags/columns';
import GroupTagForm from '@/components/users/group-tags/form';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type GroupTagsData = {
  count: number;
  tags: ListWorkspaceGroupTagsResponse['data'];
  workspaceId: string;
};

type GroupTagsSearch = {
  page?: number;
  pageSize?: number;
  q?: string;
};

function toPositiveInt(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const loadGroupTags = createServerFn({ method: 'GET' })
  .validator(
    (data: { wsId: string; page?: number; pageSize?: number; q?: string }) =>
      data
  )
  .handler(
    async ({
      data,
    }): Promise<{ data: GroupTagsData['tags']; count: number }> => {
      const result = await listWorkspaceGroupTags(
        data.wsId,
        { page: data.page, pageSize: data.pageSize, q: data.q },
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { count: result.count, data: result.data };
    }
  );

export const Route = createFileRoute('/$locale/$wsId/users/group-tags/')({
  component: GroupTagsRoutePage,
  // Pass-through: CustomDataTable reads page/pageSize from the URL via the
  // next/navigation shim, so the query keys must round-trip through the router.
  validateSearch: (search: Record<string, unknown>): GroupTagsSearch => ({
    page: toPositiveInt(search.page),
    pageSize: toPositiveInt(search.pageSize),
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page,
    pageSize: search.pageSize,
    q: search.q,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Group Tags in the Users area of your Tuturuuu workspace.',
      locale,
      title: 'Group Tags',
    });
  },
  loader: async ({ params, deps }): Promise<GroupTagsData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/users/group-tags`,
    });

    // Legacy WorkspaceWrapper -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const { count, data } = await loadGroupTags({
      data: {
        wsId: workspace.workspaceId,
        page: deps.page,
        pageSize: deps.pageSize,
        q: deps.q,
      },
    });

    return { count, tags: data, workspaceId: workspace.workspaceId };
  },
});

function GroupTagsRoutePage() {
  const data = Route.useLoaderData() as GroupTagsData | undefined;
  const { wsId } = Route.useParams();
  const t = useTranslations('ws-user-group-tags');

  if (!data) {
    throw notFound();
  }

  const tags = data.tags.map((tag) => ({
    ...tag,
    href: `/${wsId}/users/group-tags/${tag.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('plural')}
        singularTitle={t('singular')}
        description={t('description')}
        createTitle={t('create')}
        createDescription={t('create_description')}
        form={<GroupTagForm wsId={data.workspaceId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        columnGenerator={groupTagColumns}
        namespace="user-group-tag-data-table"
        data={tags as unknown as UserGroupTag[]}
        count={data.count}
        defaultVisibility={{
          id: false,
          color: false,
          created_at: false,
        }}
      />
    </>
  );
}
