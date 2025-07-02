import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUserField } from '@tuturuuu/types/primitives/WorkspaceUserField';
import { Button } from '@tuturuuu/ui/button';
import { Plus } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { userFieldColumns } from './columns';
import UserFieldEditDialog from './edit-dialog';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function WorkspaceUserFieldsPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const { data: userFields, count } = await getUserFields(
    wsId,
    await searchParams
  );
  const t = await getTranslations('ws-user-fields');

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div>
          <h1 className="font-bold text-lg md:text-2xl">{t('module')}</h1>
          <p className="text-foreground/80">{t('module_description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <UserFieldEditDialog
            data={{
              ws_id: wsId,
            }}
            trigger={
              <Button className="w-full md:w-fit">
                <Plus className="mr-2 h-5 w-5" />
                {t('create_field')}
              </Button>
            }
            submitLabel={t('create_field')}
          />
        </div>
      </div>
      <Separator className="my-4" />
      <CustomDataTable
        columnGenerator={userFieldColumns}
        namespace="user-field-data-table"
        data={userFields}
        count={count}
        defaultVisibility={{
          id: false,
          description: false,
          default_value: false,
          notes: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getUserFields(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_fields')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUserField[]; count: number };
}
