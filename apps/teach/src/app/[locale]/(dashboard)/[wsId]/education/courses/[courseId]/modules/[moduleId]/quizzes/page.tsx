import { ListTodo } from '@tuturuuu/icons';
import { getSatelliteWorkspacePermissions } from '@tuturuuu/satellite/workspace-access';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import AIQuizzes from './client-ai';
import ClientQuizzes from './client-quizzes';
import { getQuizzes } from './data';

export const metadata: Metadata = {
  title: 'Quizzes',
  description: 'Manage Quizzes in the Module area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleQuizzesPage({ params }: Props) {
  await connection();

  const { wsId: routeWsId, courseId, moduleId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(
    routeWsId,
    'update_user_groups'
  );
  const t = await getTranslations();
  const permissions = await getSatelliteWorkspacePermissions(
    'teach',
    resolvedWsId
  );

  if (!permissions || permissions.withoutPermission('update_user_groups')) {
    notFound();
  }

  const quizzes = await getQuizzes({ wsId: resolvedWsId, courseId, moduleId });

  return (
    <div className="grid gap-4">
      <FeatureSummary
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 font-bold text-lg md:text-2xl">
              <ListTodo className="h-5 w-5" />
              {t('ws-quizzes.plural')}
            </h1>
          </div>
        }
        pluralTitle={t('ws-quizzes.plural')}
        singularTitle={t('ws-quizzes.singular')}
        createTitle={t('ws-quizzes.create_manually')}
        createDescription={t('ws-quizzes.create_description')}
        href={`/${routeWsId}/education/courses/${courseId}/modules/${moduleId}/quizzes/new`}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {quizzes && quizzes.length > 0 && (
          <>
            <ClientQuizzes
              wsId={resolvedWsId}
              moduleId={moduleId}
              quizzes={quizzes}
            />
            <Separator className="col-span-full my-2" />
          </>
        )}

        <div className="col-span-full">
          <AIQuizzes wsId={resolvedWsId} moduleId={moduleId} />
        </div>
      </div>
    </div>
  );
}
