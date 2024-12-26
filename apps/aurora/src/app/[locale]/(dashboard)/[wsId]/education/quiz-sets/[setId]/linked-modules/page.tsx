import { getWorkspaceCourseModuleColumns } from './columns';
import { QuizsetModuleLinker } from './linker';
import { CustomDataTable } from '@/components/custom-data-table';
import { WorkspaceCourseModule } from '@/types/db';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedTags?: string | string[];
  excludedTags?: string | string[];
}

interface Props {
  params: Promise<{
    wsId: string;
    setId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceCoursesPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId, setId } = await params;

  const { data: allModules } = await getModules(wsId, await searchParams);
  const { data, count } = await getData(setId, await searchParams);

  const modules = data.map((m) => ({
    ...m,
    ws_id: wsId,
    href: `/${wsId}/education/courses/${m.course_id}/modules/${m.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-course-modules.plural')}
        singularTitle={t('ws-course-modules.singular')}
        description={t('ws-course-modules.description')}
        createTitle={t('ws-course-modules.create')}
        createDescription={t('ws-course-modules.create_description')}
        action={
          <QuizsetModuleLinker
            setId={setId}
            data={allModules.map((m) => ({
              ...m,
              selected: modules.some((module) => module.id === m.id),
            }))}
          />
        }
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={modules}
        columnGenerator={getWorkspaceCourseModuleColumns}
        extraData={{ wsId, setId }}
        namespace="course-data-table"
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
  setId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('course_module_quiz_sets')
    .select(
      'id:module_id, ...workspace_course_modules(course_id, name, is_public, is_published)',
      {
        count: 'exact',
      }
    )
    .eq('set_id', setId)
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
  if (error) {
    if (!retry) throw error;
    return getData(setId, { q, pageSize, retry: false });
  }

  return { data, count } as {
    data: Partial<WorkspaceCourseModule>[];
    count: number;
  };
}

async function getModules(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_course_modules')
    .select(
      'id, name, is_public, is_published, workspace_courses!inner(ws_id)',
      {
        count: 'exact',
      }
    )
    .eq('workspace_courses.ws_id', wsId)
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
  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as {
    data: Partial<WorkspaceCourseModule>[];
    count: number;
  };
}
