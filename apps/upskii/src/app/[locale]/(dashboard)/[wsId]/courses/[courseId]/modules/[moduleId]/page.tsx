import { CourseSection } from '../../section';
import ClientFlashcards from './flashcards/client-flashcards';
import ClientQuizzes from './quizzes/client-quizzes';
import FileDisplay from './resources/file-display';
import { YoutubeEmbed } from './youtube-links/embed';
import { extractYoutubeId } from '@/utils/url-helper';
import {
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/server';
import { WorkspaceCourseModule } from '@tuturuuu/types/db';
import { Accordion } from '@tuturuuu/ui/accordion';
import {
  BookText,
  Goal,
  ListTodo,
  Paperclip,
  SwatchBook,
  Youtube,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { JSONContent } from '@tuturuuu/ui/tiptap';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function UserGroupDetailsPage({ params }: Props) {
  const t = await getTranslations();
  const { wsId, courseId, moduleId } = await params;
  const data = await getModuleData(courseId, moduleId);

  const storagePath = `${wsId}/courses/${courseId}/modules/${moduleId}/resources/`;
  const resources = await getResources({ path: storagePath });
  const flashcards = await getFlashcards(moduleId);
  const quizSets = await getQuizzes(moduleId);

  const cards = flashcards.map((fc) => ({
    id: fc.id,
    front: fc.front,
    back: fc.back,
    width: '100%',
    frontCardStyle: {
      color: 'hsl(var(--green))',
      backgroundColor: 'hsl(var(--green) / 0.05)',
      borderColor: 'hsl(var(--green))',
    },
    frontHTML: (
      <div className="border-dynamic-green/10 flex h-full w-full items-center justify-center rounded-2xl border p-4 text-center font-semibold">
        {fc?.front || '...'}
      </div>
    ),
    backCardStyle: {
      color: 'hsl(var(--purple))',
      backgroundColor: 'hsl(var(--purple) / 0.05)',
      borderColor: 'hsl(var(--purple))',
    },
    backHTML: (
      <div className="border-dynamic-purple/10 flex h-full w-full items-center justify-center rounded-2xl border p-4 text-center font-semibold">
        {fc?.back || '...'}
      </div>
    ),
  }));

  return (
    <Accordion type="multiple" className="grid gap-4">
      <CourseSection
        href={`/${wsId}/courses/${courseId}/modules/${moduleId}/content`}
        title={t('course-details-tabs.module_content')}
        icon={<Goal className="h-5 w-5" />}
        rawContent={data.content as any | undefined}
        content={
          data.content ? (
            <div className="h-full max-h-[500px] overflow-y-auto">
              <RichTextEditor content={data.content as JSONContent} readOnly />
            </div>
          ) : undefined
        }
      />
      <CourseSection
        href={`/${wsId}/courses/${courseId}/modules/${moduleId}/resources`}
        title={t('course-details-tabs.resources')}
        icon={<Paperclip className="h-5 w-5" />}
        content={
          resources &&
          resources.length > 0 && (
            <div className="grid gap-4">
              {resources.map((file, index) => (
                <div
                  key={`${index}-${file}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  <div className="font-semibold hover:underline">
                    {file.name
                      // remove leading UUID_ from file name
                      .replace(
                        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_/,
                        ''
                      )}
                  </div>
                  <Separator className="my-2" />
                  <div className="w-full">
                    <FileDisplay path={storagePath} file={file} />
                  </div>
                </div>
              ))}
            </div>
          )
        }
      />
      <CourseSection
        href={`/${wsId}/courses/${courseId}/modules/${moduleId}/youtube-links`}
        title={t('course-details-tabs.youtube_links')}
        icon={<Youtube className="h-5 w-5" />}
        content={
          data.youtube_links && data.youtube_links.length > 0 ? (
            <div className="grid gap-4">
              {data.youtube_links.map((link: string, index: number) => (
                <YoutubeEmbed key={index} embedId={extractYoutubeId(link)} />
              ))}
            </div>
          ) : undefined
        }
      />
      <CourseSection
        href={`/${wsId}/courses/${courseId}/modules/${moduleId}/quizzes`}
        title={t('ws-quizzes.plural')}
        icon={<ListTodo className="h-5 w-5" />}
        content={
          quizSets && quizSets.length > 0 ? (
            <div className="grid gap-4 pt-2 md:grid-cols-2">
              <ClientQuizzes
                wsId={wsId}
                moduleId={moduleId}
                quizSets={quizSets}
                previewMode
              />
            </div>
          ) : undefined
        }
      />
      {/* <CourseSection
        href={`/${wsId}/courses/${courseId}/modules/${moduleId}/quiz-sets`}
        title={t('ws-quiz-sets.plural')}
        icon={<ListTodo className="h-5 w-5" />}
        content={
          quizzes && quizzes.length > 0 ? (
            <div className="grid gap-4 pt-2 md:grid-cols-2">
              <ClientQuizzes
                wsId={wsId}
                moduleId={moduleId}
                quizzes={quizzes}
                previewMode
              />
            </div>
          ) : undefined
        }
      /> */}
      <CourseSection
        href={`/${wsId}/courses/${courseId}/modules/${moduleId}/flashcards`}
        title={t('ws-flashcards.plural')}
        icon={<SwatchBook className="h-5 w-5" />}
        content={
          flashcards && flashcards.length > 0 ? (
            <div className="grid gap-4 pt-2 md:grid-cols-2">
              <ClientFlashcards
                wsId={wsId}
                moduleId={moduleId}
                cards={cards}
                previewMode
              />
            </div>
          ) : undefined
        }
      />
      <CourseSection
        href={`/${wsId}/courses/${courseId}/modules/${moduleId}/extra-content`}
        title={t('course-details-tabs.extra_reading')}
        icon={<BookText className="h-5 w-5" />}
        rawContent={data.extra_content as any | undefined}
        content={
          data.extra_content
            ? // <BlockEditor document={data.extra_content as any} />
              undefined
            : undefined
        }
      />
    </Accordion>
  );
}

const getModuleData = async (courseId: string, moduleId: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_course_modules')
    .select('*')
    .eq('id', moduleId)
    .eq('course_id', courseId)
    .single();

  if (error) {
    console.error('error', error);
  }

  return data as WorkspaceCourseModule;
};

const getFlashcards = async (moduleId: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('course_module_flashcards')
    .select('...workspace_flashcards(*)')
    .eq('module_id', moduleId);

  if (error) {
    console.error('error', error);
  }

  return data || [];
};

const getQuizzes = async (moduleId: string) => {
  // created_at: "2025-05-29T08:12:16.653395+00:00"
  // id: "426d031f-2dc4-4370-972d-756af04288fb"
  // question: "What are the main building blocks of a NestJS application?"
  // quiz_options: (4) [{…}, {…}, {…}, {…}]
  // ws_id: "00000000-0000-0000-0000-000000000000"
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('course_module_quizzes')
    .select(
      `
      quiz_id,
      workspace_quizzes (
        id,
        question,
        created_at,
        ws_id,
        quiz_options(*),
        quiz_set_quizzes(
          set_id,
          workspace_quiz_sets(name)
        )
      )
    `
    )
    .eq('module_id', moduleId);

  if (error) {
    console.error('Error fetching grouped quizzes:', error);
    return [];
  }

  const grouped = new Map<
    string,
    {
      setId: string;
      setName: string;
      quizzes: any[];
    }
  >();

  for (const cmq of data || []) {
    const quiz = cmq.workspace_quizzes;
    const setData = quiz?.quiz_set_quizzes?.[0]; // assume only one set

    if (!quiz || !setData) continue;

    const setId = setData.set_id;
    const setName = setData.workspace_quiz_sets?.name || 'Unnamed Set';

    if (!grouped.has(setId)) {
      grouped.set(setId, {
        setId,
        setName,
        quizzes: [],
      });
    }

    grouped.get(setId)!.quizzes.push({
      id: quiz.id,
      question: quiz.question,
      quiz_options: quiz.quiz_options,
      created_at: quiz.created_at,
      ws_id: quiz.ws_id,
    });
  }

  return Array.from(grouped.values());
};


async function getResources({ path }: { path: string }) {
  const supabase = await createDynamicClient();

  const { data, error } = await supabase.storage.from('workspaces').list(path, {
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error) throw error;

  return data;
}
