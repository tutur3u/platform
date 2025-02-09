import { projectColumns } from './columns';
import { TaskBoardForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@tutur3u/supabase/next/server';
import { TaskBoard } from '@repo/types/primitives/TaskBoard';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

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

export default async function WorkspaceProjectsPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const { data: rawData, count } = await getData(wsId, await searchParams);
  const t = await getTranslations();

  const data = rawData.map((board) => ({
    ...board,
    href: `/${wsId}/tasks/boards/${board.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-task-boards.plural')}
        singularTitle={t('ws-task-boards.singular')}
        description={t('ws-task-boards.description')}
        createTitle={t('ws-task-boards.create')}
        createDescription={t('ws-task-boards.create_description')}
        form={<TaskBoardForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        columnGenerator={projectColumns}
        namespace="basic-data-table"
        data={data}
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
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
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_boards')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name', { ascending: true })
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

  return { data, count } as { data: TaskBoard[]; count: number };
}
