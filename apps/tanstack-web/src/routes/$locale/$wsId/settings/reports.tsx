import { queryOptions, useQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api/client';
import {
  getWorkspaceConfigs,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import LeadGenerationPreview from '@tuturuuu/ui/custom/lead-generation-preview';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  leadGenerationConfigs,
  reportConfigs,
} from '@tuturuuu/utils/configs/reports';
import { useTranslations } from 'use-intl';
import { configColumns } from '@/components/settings/reports/columns';
import ReportPreviewClient from '@/components/settings/reports/report-preview-client';
import type {
  WorkspaceReportConfigActionResult,
  WorkspaceReportConfigRow,
  WorkspaceReportConfigUpdate,
} from '@/components/settings/reports/types';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type ReportsSettingsSearch = {
  q: string;
};

type ReportsSettingsData = ReportsSettingsSearch & {
  leadGenerationConfigs: WorkspaceReportConfigRow[];
  locale: string;
  reportConfigs: WorkspaceReportConfigRow[];
  workspaceId: string;
};

const REPORT_CONFIG_TRANSLATION_OVERRIDES: Partial<Record<string, string>> = {
  LEAD_EMAIL_TITLE: 'ws-reports.lead_email_table_title',
};

const REPORTS_QUERY_KEY = ['workspace-settings', 'reports'] as const;

function validateReportsSettingsSearch(
  search: Record<string, unknown>
): ReportsSettingsSearch {
  return {
    q: typeof search.q === 'string' ? search.q : '',
  };
}

function redirectToWorkspaceSettings(locale: string, wsId: string): never {
  throw redirect({
    href: `/${locale}/${wsId}/settings`,
    statusCode: 307,
  });
}

function configIds(
  configsList: Array<WorkspaceConfig & { defaultValue: string }>
) {
  return configsList
    .map((config) => config.id)
    .filter((id): id is string => Boolean(id));
}

function mergeWorkspaceConfigs(
  workspaceId: string,
  configsList: Array<WorkspaceConfig & { defaultValue: string }>,
  values: Record<string, string | null>,
  q: string
): WorkspaceReportConfigRow[] {
  const normalizedQuery = q.trim().toLowerCase();

  return configsList
    .filter(
      (
        config
      ): config is WorkspaceConfig & { defaultValue: string; id: string } =>
        Boolean(config.id)
    )
    .map(({ defaultValue, ...config }) => ({
      ...config,
      id: config.id,
      value: values[config.id] ?? defaultValue,
      ws_id: workspaceId,
    }))
    .filter((config) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        config.id.toLowerCase().includes(normalizedQuery) ||
        (config.value ?? '').toLowerCase().includes(normalizedQuery)
      );
    })
    .map((config) => ({
      ...config,
      name: config.id,
    }));
}

const loadWorkspaceReportConfigs = createServerFn({ method: 'GET' })
  .validator((data: { q: string; workspaceId: string }) => data)
  .handler(async ({ data }): Promise<Omit<ReportsSettingsData, 'locale'>> => {
    const allConfigIds = [
      ...new Set([
        ...configIds(reportConfigs),
        ...configIds(leadGenerationConfigs),
      ]),
    ];
    const values = await getWorkspaceConfigs(
      data.workspaceId,
      allConfigIds,
      withForwardedInternalApiAuth(getRequestHeaders())
    );

    return {
      leadGenerationConfigs: mergeWorkspaceConfigs(
        data.workspaceId,
        leadGenerationConfigs,
        values,
        data.q
      ),
      q: data.q,
      reportConfigs: mergeWorkspaceConfigs(
        data.workspaceId,
        reportConfigs,
        values,
        data.q
      ),
      workspaceId: data.workspaceId,
    };
  });

const saveWorkspaceReportConfig = createServerFn({ method: 'POST' })
  .validator((data: WorkspaceReportConfigUpdate) => data)
  .handler(async ({ data }): Promise<WorkspaceReportConfigActionResult> => {
    try {
      await updateWorkspaceConfig(
        data.workspaceId,
        data.configId,
        data.value,
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { ok: true };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return {
          message: error.message,
          ok: false,
          status: error.status,
        };
      }

      throw error;
    }
  });

function workspaceReportsQuery(workspaceId: string, q: string) {
  return queryOptions({
    queryFn: () =>
      loadWorkspaceReportConfigs({
        data: {
          q,
          workspaceId,
        },
      }),
    queryKey: [...REPORTS_QUERY_KEY, workspaceId, q],
    retry: false,
  });
}

function translatedReportConfigs(
  rows: WorkspaceReportConfigRow[],
  translateConfigName: (id: string) => string
) {
  return rows.map((config) => ({
    ...config,
    name: translateConfigName(config.id),
  }));
}

export const Route = createFileRoute('/$locale/$wsId/settings/reports')({
  component: ReportsSettingsRoutePage,
  validateSearch: validateReportsSettingsSearch,
  loaderDeps: ({ search }) => ({
    q: search.q,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage report and lead generation templates for your workspace.',
      locale,
      title: 'Reports',
    });
  },
  loader: async ({ context, deps, params }): Promise<ReportsSettingsData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/settings/reports`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const canManageReports = await hasWorkspacePermission({
      data: {
        permission: 'manage_user_report_templates',
        wsId: workspace.workspaceId,
      },
    });

    if (!canManageReports) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    const configs = await context.queryClient.ensureQueryData(
      workspaceReportsQuery(workspace.workspaceId, deps.q)
    );

    return {
      ...configs,
      locale: resolveMessagesLocale(params.locale),
    };
  },
});

function ReportsSettingsRoutePage() {
  const data = Route.useLoaderData() as ReportsSettingsData | undefined;
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  const configsQuery = useQuery({
    ...workspaceReportsQuery(data.workspaceId, data.q),
    initialData: {
      leadGenerationConfigs: data.leadGenerationConfigs,
      q: data.q,
      reportConfigs: data.reportConfigs,
      workspaceId: data.workspaceId,
    },
  });

  const translateConfigName = (id: string) => {
    const key =
      REPORT_CONFIG_TRANSLATION_OVERRIDES[id] ??
      `ws-reports.${id.toLowerCase()}`;

    return t(key);
  };

  const reportRows = translatedReportConfigs(
    configsQuery.data.reportConfigs,
    translateConfigName
  );
  const leadGenerationRows = translatedReportConfigs(
    configsQuery.data.leadGenerationConfigs,
    translateConfigName
  );

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div>
          <h1 className="font-bold text-2xl">{t('ws-reports.reports')}</h1>
          <p className="text-foreground/80">{t('ws-reports.description')}</p>
        </div>
      </div>
      <Separator className="my-4" />

      <Tabs defaultValue="report" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-100">
          <TabsTrigger value="report">
            {t('ws-reports.report_template')}
          </TabsTrigger>
          <TabsTrigger value="lead-generation">
            {t('ws-reports.lead_generation')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <CustomDataTable
              columnGenerator={configColumns}
              count={reportRows.length}
              data={reportRows}
              defaultVisibility={{
                created_at: false,
                id: false,
                updated_at: false,
              }}
              extraData={{
                updateConfig: (input: WorkspaceReportConfigUpdate) =>
                  saveWorkspaceReportConfig({ data: input }),
              }}
              namespace="api-key-data-table"
            />

            <ReportPreviewClient configs={reportRows} lang={data.locale} />
          </div>
        </TabsContent>

        <TabsContent value="lead-generation" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <CustomDataTable
              columnGenerator={configColumns}
              count={leadGenerationRows.length}
              data={leadGenerationRows}
              defaultVisibility={{
                created_at: false,
                id: false,
                updated_at: false,
              }}
              extraData={{
                updateConfig: (input: WorkspaceReportConfigUpdate) =>
                  saveWorkspaceReportConfig({ data: input }),
              }}
              namespace="api-key-data-table"
            />

            <LeadGenerationPreview configs={leadGenerationRows} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
