import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getUserColumns } from '@/data/columns/users';
import { DataTable } from '@/components/ui/custom/tables/data-table';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';

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

export default async function WorkspaceUserFieldsPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { t } = useTranslation('ws-secrets');

  const { data, count } = await getData(wsId, searchParams);
  const users = data.map((u) => ({ ...u, href: `/${wsId}/users/${u.id}` }));

  return (
    <>
      <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">{t('user_fields')}</h1>
          <p className="text-foreground/80">{t('description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          {/* <SecretEditDialog
            data={{
              ws_id: wsId,
            }}
            trigger={ */}
          <Button>
            <Plus className="mr-2 h-5 w-5" />
            {t('create_field')}
          </Button>
          {/* }
            submitLabel={t('create_secret')}
          /> */}
        </div>
      </div>
      <Separator className="my-4" />
      <DataTable
        data={users}
        namespace="user-data-table"
        columnGenerator={getUserColumns}
        count={count}
        defaultVisibility={{
          id: false,
        }}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const supabase = createServerComponentClient({ cookies });

  const queryBuilder = supabase
    .from('workspace_user_fields')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as { data: WorkspaceUser[]; count: number };
}
