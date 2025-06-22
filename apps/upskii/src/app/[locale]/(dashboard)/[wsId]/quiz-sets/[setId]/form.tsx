'use client';

import type { WorkspaceQuiz } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useFieldArray, useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  Check,
  CheckCheck,
  CheckCircle,
  Copy,
  HelpCircle,
  Loader2,
  Plus,
  PlusCircle,
  Save,
  Trash2,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
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
  const t = useTranslations();
  const router = useRouter();
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>(
    {}
  );

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

  const { isDirty, isValid, isSubmitting } = form.formState;
  const disabled = !isDirty || !isValid || isSubmitting;

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
            errorData.message ||
              `Failed to ${quiz.id ? 'update' : 'create'} quiz`
          );
        }

        return res.json();
      });

      await Promise.all(promises);

      toast({
        title: 'Success',
        description: `Successfully ${data && data.length > 0 ? 'updated' : 'created'} ${formData.quizzes.length} quiz${
          formData.quizzes.length > 1 ? 'es' : ''
        }`,
      });

      onFinish?.(formData);
      router.refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  };

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
          title: 'Success',
          description: 'Explanation generated successfully',
        });
      } else {
        throw new Error('Failed to generate explanation');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to generate explanation',
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

  const duplicateQuiz = (quizIndex: number) => {
    const quizToDuplicate = form.getValues(`quizzes.${quizIndex}`);
    const duplicatedQuiz = {
      ...quizToDuplicate,
      id: undefined, // Remove ID so it creates a new quiz
      question: `${quizToDuplicate.question} (Copy)`,
      quiz_options: quizToDuplicate.quiz_options.map((option) => ({
        ...option,
        id: undefined, // Remove ID so it creates new options
      })),
    };
    appendQuiz(duplicatedQuiz);
  };

  const getCorrectAnswersCount = (quizIndex: number) => {
    const options = form.watch(`quizzes.${quizIndex}.quiz_options`);
    return options.filter((option) => option.is_correct).length;
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 bg-gradient-to-r from-dynamic-purple to-dynamic-red bg-clip-text text-3xl font-bold text-transparent">
            {data && data.length > 0
              ? 'Edit Quiz Questions'
              : 'Create Quiz Questions'}
          </h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Create multiple quiz questions at once. Each question can have
            multiple options with explanations.
          </p>
          <div className="mt-4 flex justify-center gap-4">
            <Badge
              variant="outline"
              className="border-dynamic-purple text-dynamic-purple"
            >
              {quizFields.length} Question{quizFields.length !== 1 ? 's' : ''}
            </Badge>
            <Badge
              variant="outline"
              className="border-dynamic-purple text-dynamic-purple"
            >
              {quizFields.reduce((total, _, index) => {
                const options = form.watch(`quizzes.${index}.quiz_options`);
                return total + (options?.length || 0);
              }, 0)}{' '}
              Total Options
            </Badge>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* Quiz Questions */}
            <div className="space-y-6">
              {quizFields.map((field, quizIndex) => {
                const correctAnswers = getCorrectAnswersCount(quizIndex);
                const options =
                  form.watch(`quizzes.${quizIndex}.quiz_options`) || [];

                return (
                  <Card
                    key={field.id}
                    className="border-dynamic-purple shadow-lg"
                  >
                    <CardHeader className="rounded-t-lg bg-gradient-to-r from-dynamic-purple/20 to-dynamic-light-purple/40 text-secondary-foreground">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <HelpCircle className="h-5 w-5" />
                          <div>
                            <CardTitle>Question {quizIndex + 1}</CardTitle>
                            <CardDescription className='pt-1'>
                              {correctAnswers === 0 && (
                                <span className="flex items-center gap-1 text-dynamic-light-pink">
                                  <X className="h-4 w-4" />
                                  No correct answer selected
                                </span>
                              )}
                              {correctAnswers === 1 && (
                                <span className="flex items-center gap-1 text-dynamic-light-purple">
                                  <Check className="h-4 w-4" />
                                  Single correct answer
                                </span>
                              )}
                              {correctAnswers > 1 && (
                                <span className="flex items-center gap-1 text-dynamic-light-green">
                                  <CheckCheck className="h-4 w-4" />
                                  Multiple correct answers ({correctAnswers})
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
                            onClick={() => duplicateQuiz(quizIndex)}
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
                                Question
                              </FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Enter your question here..."
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
                              Answer Options
                            </FormLabel>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addQuizOption(quizIndex)}
                              className="border-dynamic-purple text-dynamic-light-purple bg-dynamic-purple/20 hover:bg-dynamic-purple/50"
                            >
                              <PlusCircle className="mr-1 h-4 w-4" />
                              Add Option
                            </Button>
                          </div>

                          <ScrollArea className="">
                            <div className="space-y-4 pr-4">
                              {options.map((_, optionIndex) => (
                                <Fragment key={optionIndex}>
                                  <div className="space-y-4 rounded-lg border border-dynamic-purple/50 p-4">
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
                                              Correct
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
                                                placeholder={`Option ${optionIndex + 1}`}
                                                {...field}
                                                className="border-dynamic-purple/30 focus:border-dynamic-purple focus:ring-dynamic-purple/20"
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />

                                      {/* Remove Option Button */}
                                      {options.length > 2 && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            removeQuizOption(
                                              quizIndex,
                                              optionIndex
                                            )
                                          }
                                          className="mt-1 text-red-500 hover:bg-dynamic-light-pink/70 hover:text-red-700"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>

                                    {/* Explanation */}
                                    <FormField
                                      control={form.control}
                                      name={`quizzes.${quizIndex}.quiz_options.${optionIndex}.explanation`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <div className="flex items-center justify-between">
                                            <FormLabel className="text-sm text-muted-foreground">
                                              Explanation
                                            </FormLabel>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() =>
                                                generateExplanation(
                                                  quizIndex,
                                                  optionIndex
                                                )
                                              }
                                              disabled={
                                                !form.getValues(
                                                  `quizzes.${quizIndex}.quiz_options.${optionIndex}.value`
                                                ) ||
                                                !!field.value ||
                                                loadingStates[
                                                  `${quizIndex}-${optionIndex}`
                                                ]
                                              }
                                              className="border border-dynamic-purple/70 text-dynamic-purple bg-dynamic-purple/20 hover:bg-dynamic-purple/50"
                                            >
                                              {loadingStates[
                                                `${quizIndex}-${optionIndex}`
                                              ] ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                              ) : (
                                                <>
                                                  <Wand2 className="mr-1 h-4 w-4" />
                                                  Generate
                                                </>
                                              )}
                                            </Button>
                                          </div>
                                          <FormControl>
                                            <Textarea
                                              placeholder="Explain why this option is correct or incorrect..."
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
              })}
            </div>

            {/* Add New Quiz Button */}
            <div className="flex justify-center">
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
                Add Another Question
              </Button>
            </div>

            <Separator />

            {/* Submit Button */}
            <div className="flex justify-center pt-6">
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-dynamic-purple to-dynamic-light-purple px-12 py-3 text-lg font-semibold text-secondary-foreground shadow-lg transition-all duration-200 hover:from-dynamic-purple/90 hover:to-dynamic-light-purple/90 hover:shadow-xl md:w-auto"
                disabled={disabled}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {data && data.length > 0 ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {data && data.length > 0
                      ? 'Update All Questions'
                      : 'Create All Questions'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
