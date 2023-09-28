import useTranslation from 'next-translate/useTranslation';
import { Separator } from '@/components/ui/separator';
import { DataTable } from '../../users/list/data-table';
import { secretColumns } from '@/data/columns/secrets';
import SecretEditDialog from './_components/secret-edit-dialog';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';
import { WorkspaceSecret } from '@/types/primitives/WorkspaceSecret';
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

export default async function WorkspaceSecretsPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { data: secrets, count } = await getSecrets(wsId, searchParams);
  const { t } = useTranslation('ws-secrets');

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">{t('secrets')}</h1>
          <p className="text-zinc-700 dark:text-zinc-400">{t('description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <SecretEditDialog
            data={{
              ws_id: wsId,
            }}
            trigger={
              <Button>
                <Plus className="mr-2 h-5 w-5" />
                {t('create_secret')}
              </Button>
            }
            submitLabel={t('create_secret')}
          />
        </div>
      </div>
      <Separator className="my-4" />
      <DataTable
        columns={secretColumns}
        data={secrets}
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getSecrets(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_secrets')
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

  return { data, count } as { data: WorkspaceSecret[]; count: number };
}
