import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import Link from 'next/link';
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
  const { resolvedWsId } = await resolveRouteWorkspace(
    routeWsId,
    'update_user_groups'
  );
  const t = await getTranslations();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t('ws-quizzes.manual_create')}
        </h1>
        <Button asChild variant="outline">
          <Link
            href={`/${routeWsId}/education/courses/${courseId}/modules/${moduleId}/quizzes`}
          >
            {t('ws-quizzes.plural')}
          </Link>
        </Button>
      </header>
      <Card>
        <CardContent>
          <NewQuizClient
            wsId={resolvedWsId}
            moduleId={moduleId}
            courseId={courseId}
          />
        </CardContent>
      </Card>
    </main>
  );
}
