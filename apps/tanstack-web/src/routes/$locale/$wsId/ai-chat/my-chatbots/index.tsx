import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { Bot } from '@tuturuuu/icons';
import {
  type ListWorkspaceGroupTagsResponse,
  listWorkspaceGroupTags,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { UserGroupTag } from '@tuturuuu/types/primitives/UserGroupTag';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { groupTagColumns } from '@/components/ai-chat/my-chatbots/columns';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { Link } from '@/lib/platform/next-link-shim';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { requireWorkspacePermission } from '@/lib/platform/workspace-permission';

type MyChatbotsData = {
  count: number;
  tags: ListWorkspaceGroupTagsResponse['data'];
  workspaceId: string;
};

type MyChatbotsSearch = {
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
    }): Promise<{ data: MyChatbotsData['tags']; count: number }> => {
      const result = await listWorkspaceGroupTags(
        data.wsId,
        { page: data.page, pageSize: data.pageSize, q: data.q },
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { count: result.count, data: result.data };
    }
  );

export const Route = createFileRoute('/$locale/$wsId/ai-chat/my-chatbots/')({
  component: MyChatbotsRoutePage,
  // Pass-through: CustomDataTable reads page/pageSize from the URL via the
  // next/navigation shim, so the query keys must round-trip through the router.
  validateSearch: (search: Record<string, unknown>): MyChatbotsSearch => ({
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
        'Manage My Chatbots in the Chat area of your Tuturuuu workspace.',
      locale,
      title: 'My Chatbots',
    });
  },
  loader: async ({ params, deps }): Promise<MyChatbotsData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/ai-chat/my-chatbots`,
    });

    // Legacy WorkspaceWrapper -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy ai-chat layout withoutPermission('ai_chat') -> redirect(`/${wsId}`).
    await requireWorkspacePermission({
      wsId: workspace.workspaceId,
      permission: 'ai_chat',
      locale: params.locale,
    });

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

function MyChatbotsRoutePage() {
  const data = Route.useLoaderData() as MyChatbotsData | undefined;
  const { locale, wsId } = Route.useParams();
  const t = useTranslations();

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
        pluralTitle={t('ai_chat.my_chatbots')}
        singularTitle={t('ws-ai-chatbots.singular')}
        description={t('ai_chat.my_chatbots_description')}
        createTitle={t('ws-ai-chatbots.create')}
        createDescription={t('ws-ai-chatbots.create_description')}
        action={
          <Link href={`/${locale}/${wsId}/ai-chat/my-chatbots/new`}>
            <Button>
              <Bot />
              {t('ws-ai-chatbots.create')}
            </Button>
          </Link>
        }
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
