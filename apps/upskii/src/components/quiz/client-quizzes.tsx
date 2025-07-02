'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { LucideBubbles, Pencil, Trash, X } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { RenderedQuizzesSets } from '@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quizzes/page';
import QuizForm from '../../app/[locale]/(dashboard)/[wsId]/quizzes/form';

interface QuizzesListProps {
  quizzes: RenderedQuizzesSets['quizzes'] | QuizzesListType;
  previewMode?: boolean;
  editingQuizId: string | null;
  setEditingQuizId: (id: string | null) => void;
  wsId: string;
  moduleId: string;
  onDelete: (id: string) => void;
  idx?: number;
}

type QuizzesListType = Array<
  | {
      created_at?: string;
      id?: string;
      question?: string;
      ws_id?: string;
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
    }
  | undefined
>;

export default function ClientQuizzes({
  wsId,
  moduleId,
  courseId,
  quizSets,
  quizzes = [],
  previewMode = false,
}: {
  wsId: string;
  moduleId: string;
  courseId: string;
  quizSets?: RenderedQuizzesSets[];
  quizzes?: QuizzesListType;
  previewMode?: boolean;
}) {
  const router = useRouter();

  const supabase = createClient();
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);

  const onDelete = async (id: string) => {
    const { error } = await supabase
      .from('workspace_quizzes')
      .delete()
      .eq('id', id);

    if (error) {
      console.log(error);
      return;
    }

    router.refresh();
  };

  const navigateQuizTake = (setId: string) => {
    router.push(
      `/${wsId}/courses/${courseId}/modules/${moduleId}/quiz-sets/${setId}/take`
    );
  };

  if (quizSets) {
    return (
      <>
        {quizSets.map((set, idx) => (
          <div
            key={set.setId}
            className="col-span-full flex w-full flex-col gap-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <h3 className="text-lg font-bold">
                <LucideBubbles className="mr-2 inline h-5 w-5" />
                {set.setName}
              </h3>
              <Button
                variant="outline"
                className="w-32 self-end justify-self-end"
                onClick={() => navigateQuizTake(set.setId)}
              >
                Take Quiz
              </Button>
              <QuizzesList
                quizzes={set.quizzes}
                previewMode={previewMode}
                editingQuizId={editingQuizId}
                setEditingQuizId={setEditingQuizId}
                wsId={wsId}
                moduleId={moduleId}
                onDelete={onDelete}
                idx={idx}
              />
              <Separator className="col-span-full my-2" />
            </div>
          </div>
        ))}
      </>
    );
  }
  if (quizzes && quizzes.length > 0) {
    return (
      <QuizzesList
        quizzes={quizzes}
        previewMode={previewMode}
        editingQuizId={editingQuizId}
        setEditingQuizId={setEditingQuizId}
        wsId={wsId}
        moduleId={moduleId}
        onDelete={onDelete}
        idx={0}
      />
    );
  }
}

const QuizzesList = ({
  quizzes,
  previewMode,
  editingQuizId,
  setEditingQuizId,
  wsId,
  moduleId,
  onDelete,
  idx = 0,
}: QuizzesListProps) => {
  const t = useTranslations();
  if (!quizzes || quizzes.length === 0) {
    return (
      <div className="rounded-lg border p-4 shadow-md md:p-6">
        <p className="text-muted-foreground">{t('ws-quizzes.no_quizzes')}</p>
      </div>
    );
  }
  return (
    <>
      {quizzes.map((quiz) => (
        <div
          key={quiz?.id || idx}
          className={cn(
            'rounded-lg border p-4 shadow-md md:p-6',
            previewMode && 'bg-foreground/5'
          )}
        >
          {editingQuizId === quiz?.id ? (
            <>
              <QuizForm
                wsId={wsId}
                moduleId={moduleId}
                data={{
                  id: quiz.id,
                  ws_id: wsId,
                  question: quiz.question,
                  quiz_options: quiz.quiz_options,
                }}
                onFinish={() => setEditingQuizId(null)}
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditingQuizId(null)}>
                  <X className="h-5 w-5" />
                  {t('common.cancel')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="quiz-question">
                <h3 className="text-lg font-semibold">
                  {quiz?.question || '...'}
                </h3>
                <Separator className="my-2" />
                <ul className="mt-4 grid gap-2">
                  {quiz?.quiz_options?.map((option, oidx) => (
                    <div
                      key={option?.id || oidx}
                      className={cn(
                        'rounded-md border p-2',
                        option?.is_correct
                          ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green'
                          : 'border-foreground/5 bg-foreground/5'
                      )}
                    >
                      <span className="font-semibold">{option?.value}</span>
                      {option?.explanation && (
                        <>
                          <Separator
                            className={cn(
                              option?.is_correct
                                ? 'bg-dynamic-green/10'
                                : 'bg-foreground/10'
                            )}
                          />
                          <div className="mt-2 text-sm opacity-80">
                            {option.explanation}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </ul>
              </div>
              {previewMode || (
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={
                      quiz?.id ? () => setEditingQuizId(quiz.id!) : undefined
                    }
                  >
                    <Pencil className="h-5 w-5" />
                    {t('common.edit')}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        <Trash className="h-5 w-5" />
                        {t('common.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t('common.confirm_delete_title')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('common.confirm_delete_description')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t('common.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={
                            quiz?.id ? () => onDelete(quiz.id!) : undefined
                          }
                        >
                          {t('common.continue')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </>
  );
};
