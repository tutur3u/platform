import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import LeadGenerationPreview from '@tuturuuu/ui/custom/lead-generation-preview';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import {
  leadGenerationConfigs,
  reportConfigs,
} from '@/constants/configs/reports';
import { configColumns } from './columns';

export const metadata: Metadata = {
  title: 'Reports',
  description:
    'Manage Reports in the Settings area of your Tuturuuu workspace.',
};

interface SearchParams {
  q?: string;
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceReportsSettingsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();
  const wsId = workspace?.id;

  const permissions = await getPermissions({
    wsId,
    redirectTo: `/${wsId}/settings`,
  });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;

  if (withoutPermission('manage_user_report_templates'))
    redirect(`/${wsId}/settings`);

  const { data: reportData } = await getConfigs(
    wsId,
    await searchParams,
    reportConfigs
  );
  const { data: leadGenData } = await getConfigs(
    wsId,
    await searchParams,
    leadGenerationConfigs
  );

  const locale = await getLocale();
  const t = await getTranslations();

  const reportConfigsData = reportData.map((config) => ({
    ...config,
    ws_id: wsId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    name: config?.id ? t(`ws-reports.${config.id.toLowerCase()}` as any) : '',
  }));

  const leadGenConfigsData = leadGenData
    .filter((config): config is typeof config & { id: string } => !!config.id) // Filter out configs without id and narrow type
    .map((config) => ({
      ...config,
      ws_id: wsId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      name: t(`ws-reports.${config.id.toLowerCase()}` as any),
    }));

  const getReportConfig = (id: string) =>
    reportConfigsData.find((c) => c.id === id)?.value;

  const parseDynamicText = (text?: string | null): ReactNode => {
    if (!text) return '';

    // Split the text into segments of dynamic keys and plain text
    const segments = text.split(/({{.*?}})/g).filter(Boolean);

    // Map over the segments, converting dynamic keys into <span> elements
    const parsedText = segments.map((segment, index) => {
      const match = segment.match(/{{(.*?)}}/);
      if (match) {
        const key = match?.[1]?.trim() || '';
        return (
          <span
            key={key + index}
            className="rounded bg-foreground px-1 py-0.5 font-semibold text-background"
          >
            {key}
          </span>
        );
      }
      return segment;
    });

    return parsedText;
  };

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
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
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
              namespace="api-key-data-table"
              data={reportConfigsData}
              defaultVisibility={{
                id: false,
                updated_at: false,
                created_at: false,
              }}
            />

            <ReportPreview
              t={t}
              lang={locale}
              parseDynamicText={parseDynamicText}
              getConfig={getReportConfig}
            />
          </div>
        </TabsContent>

        <TabsContent value="lead-generation" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <CustomDataTable
              columnGenerator={configColumns}
              namespace="api-key-data-table"
              data={leadGenConfigsData}
              defaultVisibility={{
                id: false,
                updated_at: false,
                created_at: false,
              }}
            />

            <LeadGenerationPreview configs={leadGenConfigsData} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

async function getConfigs(
  wsId: string,
  { q }: SearchParams,
  configsList: (WorkspaceConfig & { defaultValue: string })[]
) {
  const supabase = await createClient();

  // Get the list of config IDs from the provided configsList
  const configIds = configsList
    .map((c) => c.id)
    .filter((id): id is string => id !== undefined);

  const queryBuilder = supabase
    .from('workspace_configs')
    .select('*')
    .eq('ws_id', wsId)
    .in('id', configIds) // Only fetch configs that are in the provided list
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const { data: rawData, error } = await queryBuilder;
  if (error) throw error;

  // Create a copy of configsList to include in the response
  const configs = [
    ...configsList.map(({ defaultValue, ...rest }) => ({
      ...rest,
      value: defaultValue,
    })),
  ];

  // If rawData is not empty, merge it with configsList
  if (rawData?.length) {
    rawData.forEach((config) => {
      const index = configs.findIndex((c) => c.id === config.id);
      if (index !== -1) {
        // Replace the default config with the one from the database
        configs[index] = { ...configs[index], ...config };
      }
    });
  }

  const count = configs.length;

  return { data: configs, count } as {
    data: WorkspaceConfig[];
    count: number;
  };
}
