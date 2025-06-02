import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tuturuuu/supabase/next/server';
import { WorkspaceCourseModule } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import { getWorkspaceCourseModuleColumns } from './columns';
import CourseModuleForm from './form';

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

type ModuleWithCompletion = WorkspaceCourseModule & {
  is_completed: boolean;
  ws_id: string;
  href: string;
};

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
    href: `/${wsId}/courses/${courseId}/modules/${m.id}`,
  })) as ModuleWithCompletion[];

  const allModulesCompleted = modules.length > 0 && modules.every((module) => module.is_completed);

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
      {allModulesCompleted ? (
        <div className="mb-4">
          <Button variant="default" size="lg">
            Elligible for certificate
          </Button>
        </div>
      ) : (
        <></>
      )}
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  const queryBuilder = supabase
    .from('workspace_course_modules')
    .select('*, course_module_completion_status!left(completion_status)', {
      count: 'exact',
    })
    .eq('course_id', courseId)
    .eq('course_module_completion_status.user_id', user.id)
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

  return {
    data: data.map(({ course_module_completion_status, ...rest }) => ({
      ...rest,
      is_completed:
        course_module_completion_status?.[0]?.completion_status || false,
    })),
    count,
  } as { data: WorkspaceCourseModule[]; count: number };
}
