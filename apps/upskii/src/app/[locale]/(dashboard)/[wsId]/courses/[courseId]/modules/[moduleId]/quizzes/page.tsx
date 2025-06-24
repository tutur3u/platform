import AIQuizzes from '../../../../../../../../../components/quiz/client-ai';
import ClientQuizzes from '../../../../../../../../../components/quiz/client-quizzes';
import QuizForm from '../../../../../quizzes/form';
import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { ListTodo } from '@tuturuuu/ui/icons';
import { requireFeatureFlags } from '@tuturuuu/utils/feature-flags/core';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export interface RenderedQuizzesSets {
  setId: string;
  setName: string;
  quizzes:
    | Array<{
        id: string;
        question: string;
        quiz_options?: (
          | {
              created_at?: string;
              id?: string;
              is_correct?: boolean;
              explanation?: string | null;
              points?: number | null;
              quiz_id?: string;
              value?: string;
            }
          | undefined
        )[];
        created_at?: string;
        ws_id?: string;
      }>
    | undefined;
}

export default async function ModuleQuizzesPage({ params }: Props) {
  const { wsId, courseId, moduleId } = await params;
  const t = await getTranslations();
  const quizSets = await getQuizzes(moduleId);
  const moduleName = await getModuleName(moduleId);

  const { ENABLE_AI } = await requireFeatureFlags(wsId, {
    requiredFlags: ['ENABLE_AI'],
    redirectTo: null,
  });

  return (
    <div className="grid gap-4">
      <FeatureSummary
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 text-lg font-bold md:text-2xl">
              <ListTodo className="h-5 w-5" />
              {t('ws-quizzes.plural')}
            </h1>
          </div>
        }
        pluralTitle={t('ws-quizzes.plural')}
        singularTitle={t('ws-quizzes.singular')}
        createTitle={t('ws-quizzes.create')}
        createDescription={t('ws-quizzes.create_description')}
        form={<QuizForm wsId={wsId} moduleId={moduleId} />}
      />

      <div className="hello-quizzz flex flex-col gap-4">
        <ClientQuizzes
          wsId={wsId}
          moduleId={moduleId}
          quizSets={quizSets}
          courseId={courseId}
        />
        {ENABLE_AI ? (
          <div className="col-span-full">
            <AIQuizzes
              wsId={wsId}
              moduleId={moduleId}
              courseId={courseId}
              moduleName={moduleName}
            />
          </div>
        ) : undefined}
      </div>
      {/* <div className="grid gap-4 md:grid-cols-2">
        {quizSets && quizSets.length > 0 && (
          <>
            <ClientQuizzes
              wsId={wsId}
              moduleId={moduleId}
              quizSets={quizSets}
            />
            <Separator className="col-span-full my-2" />
          </>
        )}

        <div className="col-span-full">
          <AIQuizzes wsId={wsId} moduleId={moduleId} courseId={courseId} moduleName={moduleName} />
        </div>
      </div> */}
    </div>
  );
}

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

const getModuleName = async (moduleId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_course_modules')
    .select('name')
    .eq('id', moduleId)
    .single();

  if (error) {
    console.error('Error fetching module name:', error);
    throw error;
  }

  return data.name as string;
};
