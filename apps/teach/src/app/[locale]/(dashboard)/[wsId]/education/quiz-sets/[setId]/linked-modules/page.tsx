import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import { getQuizSetLinkedModules, getWorkspaceModules } from '../data';
import { getWorkspaceCourseModuleColumns } from './columns';
import { QuizsetModuleLinker } from './linker';

export const metadata: Metadata = {
  title: 'Linked Modules',
  description:
    'Manage Linked Modules in the Set area of your Tuturuuu workspace.',
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
    setId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceCoursesPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId: routeWsId, setId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);

  const { data: allModules } = await getWorkspaceModules(
    resolvedWsId,
    await searchParams
  );
  const { data, count } = await getQuizSetLinkedModules(
    resolvedWsId,
    setId,
    await searchParams
  );

  const modules = data.map((m) => ({
    ...m,
    ws_id: resolvedWsId,
    href: `/${routeWsId}/education/courses/${m.group_id}/modules/${m.id}`,
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
            wsId={resolvedWsId}
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
        extraData={{ wsId: resolvedWsId, setId }}
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
