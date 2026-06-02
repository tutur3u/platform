'use client';

import { ListTodo, Loader2, Plus, Sparkles } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import ClientQuizzes from './client-quizzes';
import DynamicQuizForm from './dynamic-form';
import { useQuizzes } from './use-quizzes';

interface Props {
  wsId: string;
  lessonId: string; // The course module ID
}

export default function LessonQuizzesSection({ wsId, lessonId }: Props) {
  const t = useTranslations();
  const [creating, setCreating] = useState(false);

  const { quizzes, isLoading, isError, refetch, generateQuiz, isGenerating } =
    useQuizzes(wsId, lessonId);

  return (
    <section className="mt-8 space-y-4 border-2 border-border bg-background p-6 shadow-[5px_5px_0_var(--border)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-dynamic-purple" />
          <h2 className="font-black text-lg">
            {t('ws-quizzes.plural')} ({quizzes.length})
          </h2>
        </div>
        {!creating && (
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-1.5 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] disabled:opacity-50"
              onClick={() => generateQuiz()}
              disabled={isGenerating}
              type="button"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('ws-quizzes.generating_with_ai')}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-dynamic-purple" />
                  {t('ws-quizzes.generate_with_ai')}
                </>
              )}
            </button>

            <button
              className="inline-flex items-center gap-1.5 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] disabled:opacity-50"
              onClick={() => setCreating(true)}
              disabled={isGenerating}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('ws-quizzes.create_manually')}
            </button>
          </div>
        )}
      </div>

      <Separator className="border-border border-b-2" />

      {creating && (
        <div className="border-2 border-border bg-card p-5 shadow-[4px_4px_0_var(--border)]">
          <h3 className="mb-4 font-black text-md">
            {t('ws-quizzes.manual_create')}
          </h3>
          <DynamicQuizForm
            wsId={wsId}
            moduleId={lessonId}
            onFinish={() => {
              setCreating(false);
              refetch();
            }}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : isError && quizzes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t('ws-quizzes.load_error')}
        </p>
      ) : quizzes.length === 0 ? (
        !creating && (
          <p className="text-muted-foreground text-sm">
            {t('ws-quizzes.empty_module')}
          </p>
        )
      ) : (
        <>
          {isError && (
            <p className="text-muted-foreground text-sm">
              {t('ws-quizzes.load_error')}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <ClientQuizzes wsId={wsId} moduleId={lessonId} quizzes={quizzes} />
          </div>
        </>
      )}
    </section>
  );
}
