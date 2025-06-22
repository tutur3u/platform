'use client';

import PasteConfirmModal from './paste-confirm-modal';
import QuizAddCard from './quiz-add-card';
import type { WorkspaceQuiz } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Form } from '@tuturuuu/ui/form';
import { useFieldArray, useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { Copy, Loader2, Plus, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  wsId: string;
  moduleId?: string;
  setId?: string;
  data?: Array<
    Partial<
      WorkspaceQuiz & {
        quiz_options: Array<{
          id?: string;
          value?: string;
          is_correct?: boolean;
          explanation?: string | null;
        }>;
      }
    >
  >;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const QuizOptionSchema = z.object({
  id: z.string().optional(),
  value: z.string().min(1, 'Option value is required'),
  is_correct: z.boolean(),
  explanation: z.string().optional(),
});

const QuizSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1, 'Question is required'),
  quiz_options: z
    .array(QuizOptionSchema)
    .min(2, 'At least 2 options are required'),
});

const FormSchema = z.object({
  moduleId: z.string().optional(),
  setId: z.string().optional(),
  quizzes: z.array(QuizSchema).min(1, 'At least one quiz is required'),
});

export default function MultiQuizForm({
  wsId,
  moduleId,
  setId,
  data,
  onFinish,
}: Props) {
  const t = useTranslations('ws-quizzes');
  const router = useRouter();

  const [showPasteConfirm, setShowPasteConfirm] = useState(false);
  const [pastedQuizzes, setPastedQuizzes] = useState<any[]>([]);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      moduleId,
      setId,
      quizzes:
        data && data.length > 0
          ? data.map((quiz) => ({
              id: quiz.id,
              question: quiz.question || '',
              quiz_options: quiz.quiz_options?.map((option) => ({
                id: option.id,
                value: option.value || '',
                is_correct: option.is_correct || false,
                explanation: option.explanation || '',
              })) || [
                { value: '', is_correct: false, explanation: '' },
                { value: '', is_correct: false, explanation: '' },
              ],
            }))
          : [
              {
                question: '',
                quiz_options: [
                  { value: '', is_correct: false, explanation: '' },
                  { value: '', is_correct: false, explanation: '' },
                ],
              },
            ],
    },
  });

  const {
    fields: quizFields,
    append: appendQuiz,
    remove: removeQuiz,
  } = useFieldArray({
    control: form.control,
    name: 'quizzes',
  });

  // Check if any quiz has 0 correct answers
  const hasQuizzesWithNoCorrectAnswers = () => {
    const quizzes = form.watch('quizzes');
    return quizzes.some((quiz) => {
      const correctAnswersCount = quiz.quiz_options.filter(
        (option) => option.is_correct
      ).length;
      return correctAnswersCount === 0;
    });
  };

  const { isDirty, isValid, isSubmitting } = form.formState;
  const disabled =
    !isDirty || !isValid || isSubmitting || hasQuizzesWithNoCorrectAnswers();

  const onSubmit = async (formData: z.infer<typeof FormSchema>) => {
    try {
      const promises = formData.quizzes.map(async (quiz) => {
        const res = await fetch(
          quiz.id
            ? `/api/v1/workspaces/${wsId}/quizzes/${quiz.id}`
            : `/api/v1/workspaces/${wsId}/quizzes`,
          {
            method: quiz.id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...quiz,
              moduleId: formData.moduleId,
              setId: formData.setId,
            }),
          }
        );

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(
            errorData.message || quiz.id
              ? t('form.error.fail-update')
              : t('form.error.fail-create')
          );
        }

        return res.json();
      });

      await Promise.all(promises);

      let description = '';
      if (formData.quizzes.length > 1) {
        if (data && data.length > 0) {
          description = t('form.success.edit-quizzes', {
            length: formData.quizzes.length,
          });
        } else {
          description = t('form.success.create-quizzes', {
            length: formData.quizzes.length,
          });
        }
      } else {
        if (data && data.length > 0) {
          description = t('form.success.edit-quiz', {
            length: formData.quizzes.length,
          });
        } else {
          description = t('form.success.create-quiz', {
            length: formData.quizzes.length,
          });
        }
      }

      toast({
        title: t('form.success.title'),
        // description: `Successfully ${data && data.length > 0 ? 'updated' : 'created'} ${formData.quizzes.length} quiz${
        //   formData.quizzes.length > 1 ? 'es' : ''
        // }`,
        description: description,
      });

      onFinish?.(formData);
      router.push(`/${wsId}/quiz-sets/${setId}`);
      router.refresh();
    } catch (error) {
      toast({
        title: t('form.error.title'),
        description:
          error instanceof Error ? error.message : t('form.error.unexpected'),
        variant: 'destructive',
      });
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const parsedData = JSON.parse(clipboardText);

      // Validate if it's a valid quiz structure
      if (
        parsedData &&
        typeof parsedData === 'object' &&
        parsedData.question &&
        parsedData.quiz_options
      ) {
        setPastedQuizzes([parsedData]);
        setShowPasteConfirm(true);
      } else if (
        Array.isArray(parsedData) &&
        parsedData.every((item) => item.question && item.quiz_options)
      ) {
        setPastedQuizzes(parsedData);
        setShowPasteConfirm(true);
      } else {
        throw new Error(t('form.error.invalid-clipboard'));
      }
    } catch (error) {
      console.log('Failed to parse clipboard data:', error);
      toast({
        title: t('form.error.invalid-clipboard-title'),
        description: t('form.error.invalid-clipboard-message'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 bg-gradient-to-r from-dynamic-purple to-dynamic-red bg-clip-text text-3xl font-bold text-transparent">
            {data && data.length > 0
              ? t('form.edit-title')
              : t('form.create-title')}
          </h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {data && data.length > 0
              ? t('form.edit-description')
              : t('form.create-description')}
          </p>
          <div className="mt-4 flex justify-center gap-4">
            <Badge
              variant="outline"
              className="border-dynamic-purple text-dynamic-purple"
            >
              {quizFields.length !== 1
                ? t('form.content.questions.count-many', {
                    count: quizFields.length,
                  })
                : t('form.content.questions.count-one', {
                    count: quizFields.length,
                  })}
            </Badge>
            <Badge
              variant="outline"
              className="border-dynamic-purple text-dynamic-purple"
            >
              {quizFields.reduce((total, _, index) => {
                const options = form.watch(`quizzes.${index}.quiz_options`);
                return total + (options?.length || 0);
              }, 0)}{' '}
              {t('form.content.options.total-options-text')}
            </Badge>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* Quiz Questions */}
            <div className="space-y-6">
              {quizFields.map((field, quizIndex) => {
                return (
                  <QuizAddCard
                    key={field.id || quizIndex}
                    wsId={wsId}
                    field={field}
                    quizIndex={quizIndex}
                    form={form}
                    removeQuiz={removeQuiz}
                    quizFields={quizFields}
                  />
                );
              })}
            </div>

            {/* Add New Quiz Button */}
            <div className="flex justify-center gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  appendQuiz({
                    question: '',
                    quiz_options: [
                      { value: '', is_correct: false, explanation: '' },
                      { value: '', is_correct: false, explanation: '' },
                    ],
                  })
                }
                className="border-dynamic-purple text-dynamic-purple hover:bg-dynamic-purple/10"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('form.add-another-button')}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={pasteFromClipboard}
                className="border-dynamic-purple text-dynamic-purple hover:bg-dynamic-purple/10"
              >
                <Copy className="mr-2 h-4 w-4" />
                {t('form.paste-question-button')}
              </Button>
            </div>

            <Separator />

            {/* Submit Button */}
            <div className="flex justify-center pt-1 pb-14">
              <Button
                type="submit"
                className="w-full border border-dynamic-purple bg-dynamic-purple/20 px-12 py-6 text-lg font-semibold text-dynamic-light-purple shadow-lg transition-all duration-200 hover:bg-dynamic-purple/60 hover:text-primary hover:shadow-xl md:w-auto md:px-20"
                disabled={disabled}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {data && data.length > 0 ? t("form.updating") : t("form.creating")}
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {data && data.length > 0
                      ? t('form.edit-button')
                      : t('form.create-button')}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
      {/* Paste Confirmation Dialog */}
      {showPasteConfirm && (
        <PasteConfirmModal
          pastedQuizzes={pastedQuizzes}
          appendQuiz={appendQuiz}
          setShowPasteConfirm={setShowPasteConfirm}
          setPastedQuizzes={setPastedQuizzes}
        />
      )}
    </div>
  );
}
