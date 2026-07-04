'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash, X } from '@tuturuuu/icons';
import { deleteWorkspaceQuiz } from '@tuturuuu/internal-api';
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
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import DynamicQuizForm from './dynamic-form';

type MultipleChoiceOptionView = {
  explanation: string | null;
  id: string;
  isCorrect: boolean;
  value: string;
};

type ContentMultipleChoiceOption = {
  index: number;
  value: string;
};

function getLegacyMultipleChoiceData(quiz: any) {
  if (quiz?.type && quiz.type !== 'multiple_choice') return {};
  if (!quiz?.quiz_options?.length) return {};

  const correctIndex = quiz.quiz_options.findIndex((o: any) => o?.is_correct);

  return {
    content: {
      options: quiz.quiz_options.map((o: any) => o?.value || ''),
    },
    answer: {
      correctIndex: correctIndex >= 0 ? correctIndex : undefined,
    },
  };
}

function getMultipleChoiceOptions(quiz: any): MultipleChoiceOptionView[] {
  const contentOptions: ContentMultipleChoiceOption[] = Array.isArray(
    quiz?.content?.options
  )
    ? quiz.content.options
        .map((option: unknown, index: number) =>
          typeof option === 'string' ? { index, value: option } : null
        )
        .filter(
          (
            option: ContentMultipleChoiceOption | null
          ): option is ContentMultipleChoiceOption => option != null
        )
    : [];

  if (contentOptions.length > 0) {
    return contentOptions.map(({ index, value }) => ({
      explanation: null,
      id: `content-${index}`,
      isCorrect: quiz?.answer?.correctIndex === index,
      value,
    }));
  }

  return (quiz?.quiz_options ?? [])
    .filter(Boolean)
    .map((option: any, index: number) => ({
      explanation: option?.explanation ?? null,
      id: option?.id ?? `legacy-${index}`,
      isCorrect: Boolean(option?.is_correct),
      value: option?.value ?? '',
    }));
}

export default function ClientQuizzes({
  wsId,
  moduleId,
  quizzes,
  previewMode = false,
  queryKey,
}: {
  wsId: string;
  moduleId: string;
  quizzes: Array<
    | {
        created_at?: string;
        id?: string;
        question?: string;
        ws_id?: string;
        type?: string;
        content?: any;
        answer?: any;
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
  previewMode?: boolean;
  queryKey?: unknown[];
}) {
  const router = useRouter();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const quizzesQueryKey = queryKey ?? ['module-quizzes', wsId, moduleId];

  const onDelete = async (id: string) => {
    try {
      await deleteWorkspaceQuiz(wsId, id);
      toast.success(t('common.success'));
      queryClient.invalidateQueries({
        queryKey: quizzesQueryKey,
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      {quizzes.map((quiz, idx) => (
        <div
          key={quiz?.id || idx}
          className={cn(
            'rounded-lg border bg-card p-4 shadow-md md:p-6',
            previewMode && 'bg-foreground/5'
          )}
        >
          {editingQuizId === quiz?.id ? (
            <>
              <DynamicQuizForm
                wsId={wsId}
                moduleId={moduleId}
                data={{
                  id: quiz.id,
                  question: quiz.question,
                  type: quiz.type,
                  content: quiz.content,
                  answer: quiz.answer,
                  ...getLegacyMultipleChoiceData(quiz),
                }}
                onFinish={() => setEditingQuizId(null)}
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditingQuizId(null)}>
                  <X className="mr-1 h-5 w-5" />
                  {t('common.cancel')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="quiz-question space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="flex-1 font-semibold text-lg">
                    {quiz?.question || '...'}
                  </h3>
                  {quiz?.type && (
                    <span className="whitespace-nowrap rounded-full bg-dynamic-purple/10 px-2.5 py-0.5 font-semibold text-dynamic-purple text-xs">
                      {t(`ws-quizzes.${quiz.type}` as any)}
                    </span>
                  )}
                </div>

                <Separator className="my-2" />

                {/* True / False Rendering */}
                {quiz?.type === 'true_false' && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div
                      className={cn(
                        'rounded-md border p-3 text-center font-semibold text-sm',
                        quiz.answer?.correct === true
                          ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green'
                          : 'border-foreground/5 bg-foreground/5 text-muted-foreground'
                      )}
                    >
                      {t('ws-quizzes.true')}
                    </div>
                    <div
                      className={cn(
                        'rounded-md border p-3 text-center font-semibold text-sm',
                        quiz.answer?.correct === false
                          ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green'
                          : 'border-foreground/5 bg-foreground/5 text-muted-foreground'
                      )}
                    >
                      {t('ws-quizzes.false')}
                    </div>
                  </div>
                )}

                {/* Multiple Choice Rendering */}
                {(!quiz?.type || quiz.type === 'multiple_choice') && (
                  <ul className="mt-4 grid gap-2">
                    {getMultipleChoiceOptions(quiz).map((option) => (
                      <li
                        key={option.id}
                        className={cn(
                          'rounded-md border p-2 text-sm',
                          option.isCorrect
                            ? 'border-dynamic-green bg-dynamic-green/10 font-semibold text-dynamic-green'
                            : 'border-foreground/5 bg-foreground/5'
                        )}
                      >
                        <span className="font-semibold">{option.value}</span>
                        {option.explanation && (
                          <>
                            <Separator
                              className={cn(
                                option.isCorrect
                                  ? 'bg-dynamic-green/10'
                                  : 'bg-foreground/10'
                              )}
                            />
                            <div className="mt-2 text-xs opacity-80">
                              {option.explanation}
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Matching Rendering */}
                {quiz?.type === 'matching' && (
                  <div className="mt-4 grid gap-2 text-sm">
                    {quiz.content?.pairs?.map(
                      (pair: { left: string; right: string }, pidx: number) => (
                        <div
                          key={pidx}
                          className="flex items-center justify-between rounded-md border border-foreground/5 bg-foreground/5 p-2"
                        >
                          <span className="font-semibold text-foreground/80">
                            {pair.left}
                          </span>
                          <span className="font-bold text-muted-foreground text-xs">
                            ⇄
                          </span>
                          <span className="font-semibold text-dynamic-green">
                            {pair.right}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Ordering Rendering */}
                {quiz?.type === 'ordering' && (
                  <div className="mt-4 grid gap-2 text-sm">
                    {quiz.content?.items?.map((item: string, iidx: number) => (
                      <div
                        key={iidx}
                        className="flex items-center gap-2 rounded-md border border-dynamic-green/30 bg-dynamic-green/5 p-2"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-dynamic-green font-bold text-white text-xs">
                          {iidx + 1}
                        </span>
                        <span className="font-semibold text-foreground">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Paragraph Rendering */}
                {quiz?.type === 'paragraph' && (
                  <div className="mt-4 border-2 border-border border-dashed bg-muted/20 p-4 text-center text-muted-foreground text-sm italic shadow-[2px_2px_0_var(--border)]">
                    {t('ws-quizzes.paragraph')}
                  </div>
                )}
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
}
