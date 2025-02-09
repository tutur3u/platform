import { configColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { availableConfigs } from '@/constants/configs/reports';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@tutur3u/supabase/next/server';
import { WorkspaceConfig } from '@repo/types/primitives/WorkspaceConfig';
import ReportPreview from '@repo/ui/components/ui/custom/report-preview';
import { Separator } from '@repo/ui/components/ui/separator';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

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
  const { wsId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
    redirectTo: `/${wsId}/settings`,
  });

  if (withoutPermission('manage_user_report_templates'))
    redirect(`/${wsId}/settings`);

  const { data } = await getConfigs(wsId, await searchParams);
  const locale = await getLocale();
  const t = await getTranslations();

  const configs = data.map((config) => ({
    ...config,
    ws_id: wsId,
    name: config?.id ? t(`ws-reports.${config.id.toLowerCase()}` as any) : '',
  }));

  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;

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
          <h1 className="text-2xl font-bold">{t('ws-reports.reports')}</h1>
          <p className="text-foreground/80">{t('ws-reports.description')}</p>
        </div>
      </div>
      <Separator className="my-4" />
      <div className="grid gap-4 xl:grid-cols-2">
        <CustomDataTable
          columnGenerator={configColumns}
          namespace="api-key-data-table"
          data={configs}
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
          getConfig={getConfig}
        />
      </div>
    </>
  );
}

async function getConfigs(wsId: string, { q }: SearchParams) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_configs')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const { data: rawData, error } = await queryBuilder;
  if (error) throw error;

  // Create a copy of availableConfigs to include in the response
  let configs = [
    ...availableConfigs.map(({ defaultValue, ...rest }) => ({
      ...rest,
      value: defaultValue,
    })),
  ];

  // If rawData is not empty, merge it with availableConfigs
  if (rawData && rawData.length) {
    rawData.forEach((config) => {
      const index = configs.findIndex((c) => c.id === config.id);
      if (index !== -1) {
        // Replace the default config with the one from the database
        configs[index] = { ...configs[index], ...config };
      } else {
        // If the config does not exist in availableConfigs, add it
        configs.push(config);
      }
    });
  }

  const count = configs.length;

  return { data: configs, count } as {
    data: WorkspaceConfig[];
    count: number;
  };
}
