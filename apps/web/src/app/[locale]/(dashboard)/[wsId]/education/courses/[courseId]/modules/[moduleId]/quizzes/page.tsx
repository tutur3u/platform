import QuizForm from '../../../../../quizzes/form';
import AIQuizzes from './client-ai';
import ClientQuizzes from './client-quizzes';
import { createClient } from '@tutur3u/supabase/next/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { ListTodo } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleQuizzesPage({ params }: Props) {
  const { wsId, moduleId } = await params;
  const t = await getTranslations();
  const quizzes = await getQuizzes(moduleId);

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

      <div className="grid gap-4 md:grid-cols-2">
        {quizzes && quizzes.length > 0 && (
          <>
            <ClientQuizzes wsId={wsId} moduleId={moduleId} quizzes={quizzes} />
            <Separator className="col-span-full my-2" />
          </>
        )}

        <div className="col-span-full">
          <AIQuizzes wsId={wsId} moduleId={moduleId} />
        </div>
      </div>
    </div>
  );
}

const getQuizzes = async (moduleId: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('course_module_quizzes')
    .select('...workspace_quizzes(*, quiz_options(*))')
    .eq('module_id', moduleId);

  if (error) {
    console.error('error', error);
  }

  return data || [];
};
