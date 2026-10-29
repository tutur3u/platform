import {
  BookText,
  Box,
  Eye,
  Goal,
  ListTodo,
  Paperclip,
  SquareCheck,
  SwatchBook,
  Youtube,
} from '@tuturuuu/icons';
import LinkButton from '@tuturuuu/ui/custom/education/modules/link-button';
import { ModuleToggles } from '@tuturuuu/ui/custom/education/modules/module-toggle';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import {
  getData,
  getFlashcards,
  getQuizSets,
  getQuizzes,
  getResources,
} from './data';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function CourseDetailsLayout({ children, params }: Props) {
  await connection();

  const t = await getTranslations();
  const { wsId: routeWsId, courseId, moduleId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const commonHref = `/${routeWsId}/education/courses/${courseId}/modules/${moduleId}`;

  const scope = { wsId: resolvedWsId, courseId, moduleId };
  const data = await getData(scope);
  const resources = await getResources({
    wsId: resolvedWsId,
    path: `${resolvedWsId}/courses/${courseId}/modules/${moduleId}/resources/`,
  });

  const flashcards = await getFlashcards(scope);
  const quizSets = await getQuizSets(scope);
  const quizzes = await getQuizzes(scope);

  return (
    <>
      <FeatureSummary
        title={
          <>
            <h1 className="flex w-full items-center gap-2 font-bold text-2xl">
              <div className="flex items-center gap-2 rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/10 px-2 text-dynamic-purple text-lg max-md:hidden">
                <Box className="h-6 w-6" />
                {t('ws-course-modules.singular')}
              </div>
              <div className="line-clamp-1 font-bold text-lg md:text-2xl">
                {data.name || t('common.unknown')}
              </div>
            </h1>
            <ModuleToggles
              wsId={resolvedWsId}
              courseId={courseId}
              moduleId={moduleId}
              isPublished={data.is_published}
            />
            <Separator className="my-2" />
          </>
        }
        description={
          <div className="grid flex-wrap gap-2 md:flex">
            <LinkButton
              href={`${commonHref}`}
              title={t('course-details-tabs.preview')}
              icon={<Eye className="h-5 w-5" />}
              className="border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/20"
            />
            <LinkButton
              href={`${commonHref}/content`}
              title={t('course-details-tabs.module_content')}
              icon={<Goal className="h-5 w-5" />}
              className="border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20"
            />
            <LinkButton
              href={`${commonHref}/resources`}
              title={`${t('course-details-tabs.resources')} (${resources.length || 0})`}
              icon={<Paperclip className="h-5 w-5" />}
              className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20"
            />
            <LinkButton
              href={`${commonHref}/youtube-links`}
              title={`${t('course-details-tabs.youtube_links')} (${data.youtube_links?.length || 0})`}
              icon={<Youtube className="h-5 w-5" />}
              className="border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20"
            />
            <LinkButton
              href={`${commonHref}/quiz-sets`}
              title={`${t('ws-quiz-sets.plural')} (${quizSets || 0})`}
              icon={<ListTodo className="h-5 w-5" />}
              className="border-dynamic-lime/20 bg-dynamic-lime/10 text-dynamic-lime hover:bg-dynamic-lime/20"
            />
            <LinkButton
              href={`${commonHref}/quizzes`}
              title={`${t('ws-quizzes.plural')} (${quizzes || 0})`}
              icon={<SquareCheck className="h-5 w-5" />}
              className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20"
            />
            <LinkButton
              href={`${commonHref}/flashcards`}
              title={`${t('ws-flashcards.plural')} (${flashcards || 0})`}
              icon={<SwatchBook className="h-5 w-5" />}
              className="border-dynamic-sky/20 bg-dynamic-sky/10 text-dynamic-sky hover:bg-dynamic-sky/20"
            />
            <LinkButton
              href={`${commonHref}/extra-content`}
              title={t('course-details-tabs.extra_reading')}
              icon={<BookText className="h-5 w-5" />}
              className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/20"
            />
          </div>
        }
      />
      <Separator className="my-4" />
      {children}
    </>
  );
}
