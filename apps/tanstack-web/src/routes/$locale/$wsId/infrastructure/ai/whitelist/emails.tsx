import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  listAIWhitelistEmails,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { AIWhitelistEmail } from '@tuturuuu/types';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { WhitelistEmailClient } from '@/components/infrastructure/ai-whitelist/emails/client-page';
import { getAIWhitelistEmailColumns } from '@/components/infrastructure/ai-whitelist/emails/columns';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type AIWhitelistSearch = {
  page: number;
  pageSize: number;
  q: string;
};

type AIWhitelistEmailsData = {
  count: number;
  data: AIWhitelistEmail[];
  page: number;
  pageSize: number;
  q: string;
  workspaceId: string;
};

function parsePositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return max ? Math.min(parsed, max) : parsed;
}

function validateAIWhitelistSearch(
  search: Record<string, unknown>
): AIWhitelistSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 10, 100),
    q: typeof search.q === 'string' ? search.q : '',
  };
}

const loadAIWhitelistEmails = createServerFn({ method: 'GET' })
  .validator((data: { page: number; pageSize: number; q?: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<{
      count: number;
      data: AIWhitelistEmail[];
    }> => {
      const response = await listAIWhitelistEmails(
        {
          page: data.page,
          pageSize: data.pageSize,
          q: data.q,
        },
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return {
        count: response.count ?? 0,
        data: response.data ?? [],
      };
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/ai/whitelist/emails'
)({
  component: AIWhitelistEmailsRoutePage,
  validateSearch: validateAIWhitelistSearch,
  loaderDeps: ({ search }) => ({
    page: search.page,
    pageSize: search.pageSize,
    q: search.q,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage AI whitelist emails.',
      locale,
      title: 'AI Whitelist Emails',
    });
  },
  loader: async ({ params, deps }): Promise<AIWhitelistEmailsData> => {
    const user = await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/ai/whitelist/emails`,
    });

    if (!user.email?.endsWith('@tuturuuu.com')) {
      throw notFound();
    }

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const canViewInfrastructure = await hasWorkspacePermission({
      data: {
        permission: 'view_infrastructure',
        wsId: ROOT_WORKSPACE_ID,
      },
    });
    if (!canViewInfrastructure) {
      throw notFound();
    }

    const result = await loadAIWhitelistEmails({
      data: {
        page: deps.page,
        pageSize: deps.pageSize,
        q: deps.q,
      },
    });

    return {
      count: result.count,
      data: result.data,
      page: deps.page,
      pageSize: deps.pageSize,
      q: deps.q,
      workspaceId: workspace.workspaceId,
    };
  },
});

function AIWhitelistEmailsRoutePage() {
  const data = Route.useLoaderData() as AIWhitelistEmailsData | undefined;
  const { locale, wsId } = Route.useParams();
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  return (
    <Tabs defaultValue="emails">
      <TabsList>
        <Link
          params={{ locale, wsId }}
          search={{ page: data.page, pageSize: data.pageSize, q: data.q }}
          to="/$locale/$wsId/infrastructure/ai/whitelist/emails"
        >
          <TabsTrigger value="emails">
            {t('ai-whitelist.email_whitelist')}
          </TabsTrigger>
        </Link>
        <Link
          params={{ locale, wsId }}
          search={{ page: data.page, pageSize: data.pageSize, q: data.q }}
          to="/$locale/$wsId/infrastructure/ai/whitelist/domains"
        >
          <TabsTrigger value="domains">
            {t('ai-whitelist.domain_whitelist')}
          </TabsTrigger>
        </Link>
      </TabsList>

      <TabsContent value="emails">
        <FeatureSummary
          pluralTitle={t('ai-whitelist.email_whitelist')}
          singularTitle={t('ai-whitelist.email_whitelist')}
          description={t('ai-whitelist.email_description')}
          form={<WhitelistEmailClient wsId={data.workspaceId} />}
        />
        <Separator className="my-4" />
        <CustomDataTable
          data={data.data}
          columnGenerator={getAIWhitelistEmailColumns}
          count={data.count}
          pageIndex={Math.max(data.page - 1, 0)}
          pageSize={data.pageSize}
          defaultVisibility={{ created_at: false, id: false }}
        />
      </TabsContent>
    </Tabs>
  );
}
