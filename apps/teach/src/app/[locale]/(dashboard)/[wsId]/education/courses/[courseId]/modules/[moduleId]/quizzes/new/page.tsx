import { ListTodo } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import NewQuizClient from './client';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function NewQuizPage({ params }: Props) {
  const { wsId: routeWsId, courseId, moduleId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const t = await getTranslations();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="flex items-center gap-2">
        <ListTodo className="h-6 w-6 text-dynamic-purple" />
        <h1 className="font-bold text-2xl text-foreground">
          {t('ws-quizzes.manual_create')}
        </h1>
      </div>
      <div className="rounded-xl border border-border bg-card p-6 shadow-md">
        <NewQuizClient
          wsId={resolvedWsId}
          moduleId={moduleId}
          courseId={courseId}
        />
      </div>
    </div>
  );
}
