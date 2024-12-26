import { getWorkspaceCourseModuleColumns } from './columns';
import CourseModuleForm from './form';
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
    courseId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceCoursesPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId, courseId } = await params;

  const { data, count } = await getData(courseId, await searchParams);

  const modules = data.map((m) => ({
    ...m,
    ws_id: wsId,
    href: `/${wsId}/education/courses/${courseId}/modules/${m.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-course-modules.plural')}
        singularTitle={t('ws-course-modules.singular')}
        description={t('ws-course-modules.description')}
        createTitle={t('ws-course-modules.create')}
        createDescription={t('ws-course-modules.create_description')}
        form={<CourseModuleForm wsId={wsId} courseId={courseId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={modules}
        columnGenerator={getWorkspaceCourseModuleColumns}
        extraData={{ wsId, courseId }}
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
  courseId: string,
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
    .select('*', {
      count: 'exact',
    })
    .eq('course_id', courseId)
    .order('name');

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
    return getData(courseId, { q, pageSize, retry: false });
  }

  return { data, count } as { data: WorkspaceCourseModule[]; count: number };
}
