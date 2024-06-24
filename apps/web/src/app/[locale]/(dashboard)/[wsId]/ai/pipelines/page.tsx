import ProjectEditDialog from '../../projects/_components/project-edit-dialog';
import { CustomDataTable } from '@/components/custom-data-table';
import { projectColumns } from '@/data/columns/projects';
import { TaskBoard } from '@/types/primitives/TaskBoard';
import { createClient } from '@/utils/supabase/server';
import { Button } from '@repo/ui/components/ui/button';
import { Separator } from '@repo/ui/components/ui/separator';
import { Plus } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';

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

export default async function WorkspaceAIPipelinesPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { data: projects, count } = await getPipelines(wsId, searchParams);
  const { t } = useTranslation('ws-ai-workflows');

  return (
    <>
      <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">{t('module')}</h1>
          <p className="text-foreground/80">{t('description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <ProjectEditDialog
            data={{
              ws_id: wsId,
            }}
            trigger={
              <Button>
                <Plus className="mr-2 h-5 w-5" />
                {t('create')}
              </Button>
            }
            submitLabel={t('create')}
          />
        </div>
      </div>
      <Separator className="my-4" />
      <CustomDataTable
        columnGenerator={projectColumns}
        namespace="basic-data-table"
        data={projects}
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getPipelines(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = createClient();

  const queryBuilder = supabase
    .from('workspace_boards')
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

  // const { data, error, count } = await queryBuilder;
  // if (error) throw error;

  // return { data, count } as { data: TaskBoard[]; count: number };
  return { data: [], count: 0 } as { data: TaskBoard[]; count: number };
}
