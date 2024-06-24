import { configColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { availableConfigs } from '@/constants/configs/reports';
import { WorkspaceConfig } from '@/types/primitives/WorkspaceConfig';
import { createClient } from '@/utils/supabase/server';
import ReportPreview from '@repo/ui/components/ui/custom/report-preview';
import { Separator } from '@repo/ui/components/ui/separator';
import useTranslation from 'next-translate/useTranslation';
import { ReactNode } from 'react';

interface SearchParams {
  q?: string;
}

interface Props {
  params: {
    wsId: string;
  };
  searchParams: SearchParams;
}

export default async function WorkspaceReportsSettingsPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { data } = await getConfigs(wsId, searchParams);
  const { t, lang } = useTranslation('ws-reports');

  const configs = data.map((config) => ({
    ...config,
    ws_id: wsId,
    name: config?.id ? t(config.id.toLowerCase()) : '',
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
            className="text-background bg-foreground rounded px-1 py-0.5 font-semibold"
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
      <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">{t('reports')}</h1>
          <p className="text-foreground/80">{t('description')}</p>
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
          lang={lang}
          parseDynamicText={parseDynamicText}
          getConfig={getConfig}
        />
      </div>
    </>
  );
}

async function getConfigs(wsId: string, { q }: SearchParams) {
  const supabase = createClient();

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
