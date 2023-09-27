import useTranslation from 'next-translate/useTranslation';
import { Separator } from '@/components/ui/separator';
import { DataTable } from '../../users/list/data-table';
import { apiConfigColumns } from '@/data/columns/api-configs';
import ApiConfigEditDialog from './_components/api-config-edit-dialog';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';
import { ApiConfig } from '@/types/primitives/ApiConfig';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q?: string;
    page?: string;
    pageSize?: string;
  };
}

export default async function WorkspaceApiConfigsPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { data: configs, count } = await getConfigs(wsId, searchParams);
  const { t } = useTranslation('ws-api-configs');

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">API</h1>
          <p className="text-zinc-700 dark:text-zinc-400">{t('description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <ApiConfigEditDialog
            data={{
              ws_id: wsId,
            }}
            trigger={
              <Button>
                <Plus className="mr-2 h-5 w-5" />
                {t('create_config')}
              </Button>
            }
            submitLabel={t('create_config')}
          />
        </div>
      </div>
      <Separator className="my-4" />
      <DataTable
        columns={apiConfigColumns}
        data={configs}
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getConfigs(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_external_api_configs')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (
    page &&
    pageSize &&
    typeof page === 'string' &&
    typeof pageSize === 'string'
  ) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: ApiConfig[]; count: number };
}
