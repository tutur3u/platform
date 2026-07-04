import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getWorkspaceGroupTag,
  listWorkspaceGroupTagUserGroups,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { UserGroupTag } from '@tuturuuu/types/primitives/UserGroupTag';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { getTaggedUserGroupColumns } from '@/components/users/group-tags/detail-columns';
import UserGroupTagDetailForm from '@/components/users/group-tags/detail-form';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type GroupTagDetailData = {
  count: number;
  groups: UserGroup[];
  tag: UserGroupTag;
  workspaceId: string;
};

type GroupTagDetailSearch = {
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

const loadGroupTagDetail = createServerFn({ method: 'GET' })
  .validator(
    (data: {
      page?: number;
      pageSize?: number;
      q?: string;
      tagId: string;
      wsId: string;
    }) => data
  )
  .handler(async ({ data }): Promise<GroupTagDetailData> => {
    const auth = withForwardedInternalApiAuth(getRequestHeaders());
    const [tag, groups] = await Promise.all([
      getWorkspaceGroupTag(data.wsId, data.tagId, auth),
      listWorkspaceGroupTagUserGroups(
        data.wsId,
        data.tagId,
        {
          page: data.page,
          pageSize: data.pageSize,
          q: data.q,
        },
        auth
      ),
    ]);

    if (!tag.data) {
      throw notFound();
    }

    return {
      count: groups.count,
      groups: groups.data,
      tag: tag.data,
      workspaceId: data.wsId,
    };
  });

export const Route = createFileRoute('/$locale/$wsId/users/group-tags/$tagId')({
  component: GroupTagDetailRoutePage,
  validateSearch: (search: Record<string, unknown>): GroupTagDetailSearch => ({
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
        'Manage Tag Details in the Group Tags area of your Tuturuuu workspace.',
      locale,
      title: 'Tag Details',
    });
  },
  loader: async ({ params, deps }): Promise<GroupTagDetailData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/users/group-tags/${params.tagId}`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    return loadGroupTagDetail({
      data: {
        wsId: workspace.workspaceId,
        tagId: params.tagId,
        page: deps.page,
        pageSize: deps.pageSize,
        q: deps.q,
      },
    });
  },
});

function GroupTagDetailRoutePage() {
  const data = Route.useLoaderData() as GroupTagDetailData | undefined;
  const { locale, tagId, wsId } = Route.useParams();
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  const groups = data.groups.map((group) => ({
    ...group,
    href: `/${locale}/${wsId}/users/groups/${group.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={data.tag.name || t('ws-user-groups.plural')}
        singularTitle={data.tag.name || t('ws-user-groups.singular')}
        description={t('ws-user-groups.description')}
        createTitle={t('ws-user-group-tags.add_group')}
        createDescription={t('ws-user-group-tags.add_group_description')}
        form={<UserGroupTagDetailForm tagId={tagId} wsId={data.workspaceId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={groups}
        namespace="user-group-data-table"
        columnGenerator={getTaggedUserGroupColumns}
        extraData={{ locale, tagId, wsId: data.workspaceId }}
        count={data.count}
        defaultVisibility={{
          created_at: false,
          id: false,
        }}
      />
    </>
  );
}
