import {
  ClipboardCheck,
  Link as LinkIcon,
  ListTodo,
  Paperclip,
  SwatchBook,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { StorageObjectForm } from '@tuturuuu/ui/custom/education/modules/resources/file-upload-form';
import YouTubeLinkForm from '@tuturuuu/ui/custom/education/modules/youtube/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import FlashcardForm from '../../../flashcards/form';
import QuizSetForm from '../../../quiz-sets/form';
import QuizForm from '../../../quizzes/form';
import { ModuleContentEditor } from '../modules/[moduleId]/content/content-editor';
import type { useCourseBuilder } from './use-course-builder';

const editorTabs = [
  { id: 'content', label: 'course-details-tabs.module_content' },
  { id: 'resources', label: 'course-details-tabs.resources' },
  { id: 'youtube', label: 'course-details-tabs.youtube_links' },
  { id: 'quiz-sets', label: 'ws-quiz-sets.plural' },
  { id: 'quizzes', label: 'ws-quizzes.plural' },
  { id: 'flashcards', label: 'ws-flashcards.plural' },
  { id: 'extra', label: 'course-details-tabs.extra_reading' },
] as const;

export function ModuleEditor({
  activeModule,
  courseId,
  resolvedWsId,
  routeWsId,
}: {
  activeModule: NonNullable<
    ReturnType<typeof useCourseBuilder>['activeModule']
  >;
  courseId: string;
  resolvedWsId: string;
  routeWsId: string;
}) {
  const t = useTranslations();
  return (
    <div className="min-w-0 space-y-4">
      <h2 className="break-words font-semibold text-lg">{activeModule.name}</h2>
      <Tabs defaultValue="content" className="space-y-4">
        <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1">
          {editorTabs.map(({ id, label }) => (
            <TabsTrigger key={id} value={id}>
              {t(label)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="content" className="space-y-3">
          <ModuleContentEditor
            wsId={resolvedWsId}
            courseId={courseId}
            moduleId={activeModule.id}
            content={(activeModule.content as never) ?? undefined}
          />
        </TabsContent>

        <TabsContent value="resources" className="space-y-3">
          <StorageObjectForm
            wsId={resolvedWsId}
            submitLabel={t('common.upload')}
            path={`${resolvedWsId}/courses/${courseId}/modules/${activeModule.id}/resources/`}
          />
          <Button asChild variant="outline" className="rounded-xl">
            <Link
              href={`/${routeWsId}/education/courses/${courseId}/modules/${activeModule.id}/resources`}
            >
              <Paperclip className="h-4 w-4" />
              {t('common.view')}
            </Link>
          </Button>
        </TabsContent>

        <TabsContent value="youtube" className="space-y-3">
          <YouTubeLinkForm
            wsId={resolvedWsId}
            moduleId={activeModule.id}
            links={activeModule.youtube_links || []}
          />
        </TabsContent>

        <TabsContent value="quiz-sets" className="space-y-3">
          <QuizSetForm wsId={resolvedWsId} moduleId={activeModule.id} />
          <Button asChild variant="outline" className="rounded-xl">
            <Link
              href={`/${routeWsId}/education/courses/${courseId}/modules/${activeModule.id}/quiz-sets`}
            >
              <ListTodo className="h-4 w-4" />
              {t('common.view')}
            </Link>
          </Button>
        </TabsContent>

        <TabsContent value="quizzes" className="space-y-3">
          <QuizForm wsId={resolvedWsId} moduleId={activeModule.id} />
          <Button asChild variant="outline" className="rounded-xl">
            <Link
              href={`/${routeWsId}/education/courses/${courseId}/modules/${activeModule.id}/quizzes`}
            >
              <ClipboardCheck className="h-4 w-4" />
              {t('common.view')}
            </Link>
          </Button>
        </TabsContent>

        <TabsContent value="flashcards" className="space-y-3">
          <FlashcardForm wsId={resolvedWsId} moduleId={activeModule.id} />
          <Button asChild variant="outline" className="rounded-xl">
            <Link
              href={`/${routeWsId}/education/courses/${courseId}/modules/${activeModule.id}/flashcards`}
            >
              <SwatchBook className="h-4 w-4" />
              {t('common.view')}
            </Link>
          </Button>
        </TabsContent>

        <TabsContent value="extra" className="space-y-3">
          <Button asChild variant="outline" className="rounded-xl">
            <Link
              href={`/${routeWsId}/education/courses/${courseId}/modules/${activeModule.id}/extra-content`}
            >
              <LinkIcon className="h-4 w-4" />
              {t('common.open')}
            </Link>
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
