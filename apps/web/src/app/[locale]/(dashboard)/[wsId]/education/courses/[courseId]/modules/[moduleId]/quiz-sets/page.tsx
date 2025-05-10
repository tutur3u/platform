import { getQuizSetColumns } from './columns';
import CourseModuleForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tuturuuu/supabase/next/server';
import { type WorkspaceQuizSet } from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
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
    courseId: string;
    moduleId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceCoursesPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId, courseId, moduleId } = await params;

  const { data, count } = await getData(moduleId, await searchParams);

  const quizSets = data.map((m) => ({
    ...m,
    ws_id: wsId,
    href: `/${wsId}/quiz-sets/${m.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-quiz-sets.plural')}
        singularTitle={t('ws-quiz-sets.singular')}
        createTitle={t('ws-quiz-sets.create')}
        createDescription={t('ws-quiz-sets.create_description')}
        form={<CourseModuleForm wsId={wsId} moduleId={moduleId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={quizSets}
        columnGenerator={getQuizSetColumns}
        extraData={{ wsId, courseId, moduleId }}
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
  moduleId: string,
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
    .select('...workspace_quiz_sets(*)', {
      count: 'exact',
    })
    .eq('module_id', moduleId)
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
    return getData(moduleId, { q, pageSize, retry: false });
  }

  return { data, count } as { data: WorkspaceQuizSet[]; count: number };
}
