import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { UseFormReturn } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  Check,
  CheckCheck,
  Copy,
  HelpCircle,
  Loader2,
  PlusCircle,
  Trash2,
  Wand2,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import React, { Fragment, useState } from 'react';
import type { FieldArrayWithId } from 'react-hook-form';

type FormReturnType = UseFormReturn<
  {
    quizzes: {
      quiz_options: {
        value: string;
        is_correct: boolean;
        id?: string | undefined;
        explanation?: string | undefined;
      }[];
      question: string;
      id?: string | undefined;
    }[];
    moduleId?: string | undefined;
    setId?: string | undefined;
  },
  unknown,
  {
    quizzes: {
      quiz_options: {
        value: string;
        is_correct: boolean;
        id?: string | undefined;
        explanation?: string | undefined;
      }[];
      question: string;
      id?: string | undefined;
    }[];
    moduleId?: string | undefined;
    setId?: string | undefined;
  }
>;

type FieldType = FieldArrayWithId<
  {
    quizzes: {
      quiz_options: {
        value: string;
        is_correct: boolean;
        id?: string | undefined;
        explanation?: string | undefined;
      }[];
      question: string;
      id?: string | undefined;
    }[];
    moduleId?: string | undefined;
    setId?: string | undefined;
  },
  'quizzes',
  'id'
>;

export default function QuizAddCard({
  wsId,
  field,
  quizIndex,
  form,
  removeQuiz,
  quizFields,
}: {
  wsId: string;
  form: FormReturnType;
  quizIndex: number;
  field: FieldType;
  removeQuiz: (index: number) => void;
  quizFields: FieldType[];
}) {
  const t = useTranslations('ws-quizzes.form');
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>(
    {}
  );
  const generateExplanation = async (
    quizIndex: number,
    optionIndex: number
  ) => {
    const question = form.getValues(`quizzes.${quizIndex}.question`);
    const option = form.getValues(
      `quizzes.${quizIndex}.quiz_options.${optionIndex}`
    );

    const loadingKey = `${quizIndex}-${optionIndex}`;
    setLoadingStates((prev) => ({ ...prev, [loadingKey]: true }));

    try {
      const res = await fetch('/api/ai/objects/quizzes/explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wsId, question, option }),
      });

      if (res.ok) {
        const { explanation } = await res.json();
        form.setValue(
          `quizzes.${quizIndex}.quiz_options.${optionIndex}.explanation`,
          explanation
        );
        toast({
          title: t('success.title'),
          description: t('success.explanation-generated'),
        });
      } else {
        throw new Error(t('error.explanation-generation-failed'));
      }
    } catch (error) {
      toast({
        title: t('error.title'),
        description:
          error instanceof Error
            ? error.message
            : t('error.explanation-generation-failed'),
        variant: 'destructive',
      });
    } finally {
      setLoadingStates((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  const addQuizOption = (quizIndex: number) => {
    const currentOptions = form.getValues(`quizzes.${quizIndex}.quiz_options`);
    form.setValue(`quizzes.${quizIndex}.quiz_options`, [
      ...currentOptions,
      { value: '', is_correct: false, explanation: '' },
    ]);
  };

  const removeQuizOption = (quizIndex: number, optionIndex: number) => {
    const currentOptions = form.getValues(`quizzes.${quizIndex}.quiz_options`);
    if (currentOptions.length > 2) {
      const newOptions = currentOptions.filter(
        (_, index) => index !== optionIndex
      );
      form.setValue(`quizzes.${quizIndex}.quiz_options`, newOptions);
    }
  };

  const getCorrectAnswersCount = (quizIndex: number) => {
    const options = form.watch(`quizzes.${quizIndex}.quiz_options`);
    return options.filter((option) => option.is_correct).length;
  };

  const copyQuizToClipboard = async (quizIndex: number) => {
    try {
      const quizToCopy = form.getValues(`quizzes.${quizIndex}`);
      const clipboardText = JSON.stringify(quizToCopy, null, 2);
      await navigator.clipboard.writeText(clipboardText);
      toast({
        title: t('success.title'),
        description: t('success.quiz-copied'),
      });
    } catch (error) {
      console.error('Failed to copy quiz:', error);
      toast({
        title: t('error.title'),
        description: t('error.quiz-copy-failed'),
        variant: 'destructive',
      });
    }
  };

  const correctAnswers = getCorrectAnswersCount(quizIndex);
  const options = form.watch(`quizzes.${quizIndex}.quiz_options`) || [];

  return (
    <Card key={field.id} className="border-dynamic-purple shadow-lg">
      <CardHeader className="rounded-t-lg bg-gradient-to-r from-dynamic-purple/20 to-dynamic-light-purple/40 text-secondary-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HelpCircle className="h-5 w-5" />
            <div>
              <CardTitle>
                {t('question-no', {
                  no: quizIndex + 1,
                })}
              </CardTitle>
              <CardDescription className="pt-1">
                {correctAnswers === 0 && (
                  <span className="flex items-center gap-1 text-dynamic-light-pink">
                    <X className="h-4 w-4" />
                    {t('content.correct-answers.no-selected')}
                  </span>
                )}
                {correctAnswers === 1 && (
                  <span className="flex items-center gap-1 text-dynamic-light-purple">
                    <Check className="h-4 w-4" />
                    {t('content.correct-answers.single-selected')}
                  </span>
                )}
                {correctAnswers > 1 && (
                  <span className="flex items-center gap-1 text-dynamic-light-green">
                    <CheckCheck className="h-4 w-4" />
                    {t('content.correct-answers.multiple-selected')} (
                    {correctAnswers})
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => copyQuizToClipboard(quizIndex)}
              className="text-secondary-foreground hover:bg-primary/20"
            >
              <Copy className="h-4 w-4" />
            </Button>
            {quizFields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeQuiz(quizIndex)}
                className="text-secondary-foreground hover:bg-red-500/20"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* Question Input */}
          <FormField
            control={form.control}
            name={`quizzes.${quizIndex}.question`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold text-dynamic-light-purple">
                  {t('content.questions.label')}
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t('content.questions.placeholder')}
                    {...field}
                    rows={3}
                    className="border-dynamic-purple/30 focus:border-dynamic-purple focus:ring-dynamic-purple/20"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <FormLabel className="font-semibold text-dynamic-light-purple">
                {t('content.options.label')}
              </FormLabel>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addQuizOption(quizIndex)}
                className="border-dynamic-purple bg-dynamic-purple/20 text-dynamic-light-purple hover:bg-dynamic-purple/50"
              >
                <PlusCircle className="mr-1 h-4 w-4" />
                {t('content.options.add-button')}
              </Button>
            </div>

            <ScrollArea className="">
              <div className="space-y-8 pr-4">
                {options.map((_, optionIndex) => (
                  <Fragment key={optionIndex}>
                    <div className="space-y-4 rounded-lg border border-dynamic-purple/50 bg-dynamic-light-purple/5 p-4">
                      <div className="flex items-start gap-4">
                        {/* Correct Answer Checkbox */}
                        <FormField
                          control={form.control}
                          name={`quizzes.${quizIndex}.quiz_options.${optionIndex}.is_correct`}
                          render={({ field }) => (
                            <FormItem className="mt-2 flex items-center space-y-0 space-x-2">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="border-dynamic-purple data-[state=checked]:border-dynamic-purple data-[state=checked]:bg-dynamic-purple"
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-medium text-dynamic-purple">
                                {t('content.options.correct-label')}
                              </FormLabel>
                            </FormItem>
                          )}
                        />

                        {/* Option Value */}
                        <FormField
                          control={form.control}
                          name={`quizzes.${quizIndex}.quiz_options.${optionIndex}.value`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormControl>
                                <Input
                                  placeholder={t(
                                    'content.options.placeholder',
                                    {
                                      no: optionIndex + 1,
                                    }
                                  )}
                                  {...field}
                                  className="border-dynamic-purple/30 focus:border-dynamic-purple focus:ring-dynamic-purple/20"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Remove Option Button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            removeQuizOption(quizIndex, optionIndex)
                          }
                          disabled={options.length <= 2}
                          className="mt-1 text-red-500 hover:bg-dynamic-light-pink/70 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Explanation */}
                      <FormField
                        control={form.control}
                        name={`quizzes.${quizIndex}.quiz_options.${optionIndex}.explanation`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel className="text-sm text-muted-foreground">
                                {t('content.options.explanation-label')}
                              </FormLabel>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  generateExplanation(quizIndex, optionIndex)
                                }
                                disabled={
                                  !form.getValues(
                                    `quizzes.${quizIndex}.quiz_options.${optionIndex}.value`
                                  ) ||
                                  !!field.value ||
                                  loadingStates[`${quizIndex}-${optionIndex}`]
                                }
                                className="border border-dynamic-purple/70 bg-dynamic-purple/20 text-dynamic-purple hover:bg-dynamic-purple/50"
                              >
                                {loadingStates[
                                  `${quizIndex}-${optionIndex}`
                                ] ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Wand2 className="mr-1 h-4 w-4" />
                                    {t(
                                      'content.options.generate-explanation-button'
                                    )}
                                  </>
                                )}
                              </Button>
                            </div>
                            <FormControl>
                              <Textarea
                                placeholder={t(
                                  'content.options.explanation-placeholder'
                                )}
                                {...field}
                                rows={2}
                                className="border-dynamic-purple/50 text-sm focus:border-dynamic-purple focus:ring-dynamic-purple/20"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </Fragment>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
