'use client';

import { WorkspaceQuiz } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { AutosizeTextarea } from '@tuturuuu/ui/custom/autosize-textarea';
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
import { Loader, Pencil, Plus, PlusCircle, Wand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import * as z from 'zod';

interface Props {
  wsId: string;
  moduleId?: string;
  setId?: string;
  data?: Partial<
    WorkspaceQuiz & {
      quiz_options: (
        | {
            id?: string;
            value?: string;
            is_correct?: boolean;
            explanation?: string | null;
          }
        | undefined
      )[];
    }
  >;
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const QuizOptionSchema = z.object({
  id: z.string().optional(),
  value: z.string().min(1),
  is_correct: z.boolean(),
  explanation: z.string().optional(), // Add explanation field
});

const FormSchema = z.object({
  id: z.string().optional(),
  moduleId: z.string().optional(),
  setId: z.string().optional(),
  question: z.string().min(1),
  quiz_options: z.array(QuizOptionSchema).min(1),
});

export default function QuizForm({
  wsId,
  moduleId,
  setId,
  data,
  onFinish,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      moduleId,
      setId,
      question: data?.question || '',
      quiz_options: data?.quiz_options?.map((option) => ({
        id: option?.id,
        value: option?.value || '',
        is_correct: option?.is_correct || false,
        explanation: option?.explanation || '',
      })) || [{ value: '', is_correct: false, explanation: '' }], // Ensure explanation values are included
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'quiz_options',
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      const res = await fetch(
        data.id
          ? `/api/v1/workspaces/${wsId}/quizzes/${data.id}`
          : `/api/v1/workspaces/${wsId}/quizzes`,
        {
          method: data.id ? 'PUT' : 'POST',
          body: JSON.stringify(data),
        }
      );

      if (res.ok) {
        onFinish?.(data);
        router.refresh();
      } else {
        const resData = await res.json();
        toast({
          title: `Failed to ${data.id ? 'edit' : 'create'} quiz`,
          description: resData.message,
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} quiz`,
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const generateExplanation = async (index: number) => {
    const question = form.getValues('question');
    const option = form.getValues(`quiz_options.${index}`);

    setLoadingIndex(index);

    try {
      const res = await fetch('/api/ai/objects/quizzes/explanation', {
        method: 'POST',
        body: JSON.stringify({ wsId, question, option }),
      });

      if (res.ok) {
        const { explanation } = await res.json();
        form.setValue(`quiz_options.${index}.explanation`, explanation);
      } else {
        toast({
          title: t('common.error'),
          description: t('ws-quizzes.generation_error'),
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoadingIndex(null);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="question"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('common.question')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('common.question')}
                  autoComplete="off"
                  {...field}
                  className="rounded-md border-foreground/20 shadow-sm"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        <ScrollArea className="-m-2 h-fit max-h-96 overflow-y-auto">
          <div className="grid gap-4 p-2">
            {fields.map((field, index) => (
              <Fragment key={field.id}>
                <div className="flex items-end space-x-4">
                  <FormField
                    control={form.control}
                    name={`quiz_options.${index}.value`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormField
                          control={form.control}
                          name={`quiz_options.${index}.is_correct`}
                          render={({ field }) => (
                            <FormItem className="flex items-center space-y-0 space-x-1">
                              <Checkbox
                                id={`quiz_options.${index}.is_correct`}
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                className="p-0"
                              />
                              <FormLabel>{t('common.correct')}</FormLabel>
                            </FormItem>
                          )}
                        />
                        <FormControl>
                          <Input
                            placeholder={`${t('common.option')} ${index + 1}`}
                            autoComplete="off"
                            {...field}
                            className="rounded-md border-foreground/20 shadow-sm"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => remove(index)}
                    className="ml-2"
                  >
                    {t('common.remove')}
                  </Button>
                </div>
                <FormField
                  control={form.control}
                  name={`quiz_options.${index}.explanation`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-end justify-between gap-2">
                        {t('common.explanation')}
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => generateExplanation(index)}
                          disabled={
                            !form.getValues(`quiz_options.${index}.value`) ||
                            !!field.value ||
                            loadingIndex === index
                          }
                        >
                          {loadingIndex === index ? (
                            <Loader className="animate-spin" />
                          ) : (
                            <>
                              {t('common.generate_explanation')}
                              <Wand />
                            </>
                          )}
                        </Button>
                      </FormLabel>
                      <FormControl>
                        <AutosizeTextarea
                          placeholder={t('common.explanation')}
                          autoComplete="off"
                          {...field}
                          className="rounded-md border-foreground/20 shadow-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {index < fields.length - 1 && <Separator />}
              </Fragment>
            ))}
          </div>
        </ScrollArea>

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            append({ value: '', is_correct: false, explanation: '' })
          }
          className="w-full"
        >
          <PlusCircle />
          {t('common.add_option')}
        </Button>

        <Separator />

        <Button type="submit" className="w-full" disabled={disabled}>
          {data?.id ? (
            <>
              <Pencil />
              {t('ws-quizzes.edit')}
            </>
          ) : (
            <>
              <Plus />
              {t('ws-quizzes.create')}
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
