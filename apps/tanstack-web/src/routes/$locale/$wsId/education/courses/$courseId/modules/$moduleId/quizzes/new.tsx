import { createFileRoute, notFound } from '@tanstack/react-router';
import { ListTodo } from '@tuturuuu/icons';
import { useTranslations } from 'use-intl';
import NewQuizClient from '@/components/education/quizzes/new-quiz-client';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '@/lib/platform/workspace';

export const Route = createFileRoute(
  '/$locale/$wsId/education/courses/$courseId/modules/$moduleId/quizzes/new'
)({
  component: NewQuizRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Create a new quiz for this course module.',
      locale,
      title: 'New Quiz',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/courses/${params.courseId}/modules/${params.moduleId}/quizzes/new`,
    });

    // Legacy resolveRouteWorkspace -> the resolved workspace id; notFound when
    // the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    return workspace;
  },
});

function NewQuizRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;
  const { courseId, locale, moduleId } = Route.useParams();
  // `ws-quizzes` namespace resolves via the $locale layout's IntlProvider.
  const t = useTranslations('ws-quizzes');

  if (!workspace) {
    throw notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="flex items-center gap-2">
        <ListTodo className="h-6 w-6 text-dynamic-purple" />
        <h1 className="font-bold text-2xl text-foreground">
          {t('manual_create')}
        </h1>
      </div>
      <div className="rounded-xl border border-border bg-card p-6 shadow-md">
        <NewQuizClient
          locale={locale}
          wsId={workspace.workspaceId}
          moduleId={moduleId}
          courseId={courseId}
        />
      </div>
    </div>
  );
}
