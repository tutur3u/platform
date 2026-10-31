import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import { getQuizSetColumns } from './columns';
import { getData } from './data';
import CourseModuleForm from './form';

export const metadata: Metadata = {
  title: 'Quiz Sets',
  description:
    'Manage Quiz Sets in the Module area of your Tuturuuu workspace.',
};

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
  const { wsId: routeWsId, courseId, moduleId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(
    routeWsId,
    'update_user_groups'
  );

  const { data, count } = await getData(
    { wsId: resolvedWsId, courseId, moduleId },
    await searchParams
  );

  const quizSets = data.map((m) => ({
    ...m,
    ws_id: resolvedWsId,
    href: `/${routeWsId}/education/quiz-sets/${m.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-quiz-sets.plural')}
        singularTitle={t('ws-quiz-sets.singular')}
        createTitle={t('ws-quiz-sets.create')}
        createDescription={t('ws-quiz-sets.create_description')}
        form={<CourseModuleForm wsId={resolvedWsId} moduleId={moduleId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={quizSets}
        columnGenerator={getQuizSetColumns}
        extraData={{ wsId: resolvedWsId, courseId, moduleId }}
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
