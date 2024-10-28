'use client';

import { WorkspaceQuiz } from '@/types/db';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import { Checkbox } from '@repo/ui/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import { Separator } from '@repo/ui/components/ui/separator';
import { toast } from '@repo/ui/hooks/use-toast';
import { Pencil, Plus, PlusCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Fragment } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  moduleId?: string;
  data?: Partial<
    WorkspaceQuiz & {
      quiz_options: { id: string; value: string; is_correct: boolean }[];
    }
  >;
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const QuizOptionSchema = z.object({
  id: z.string().optional(),
  value: z.string().min(1),
  is_correct: z.boolean(),
});

const FormSchema = z.object({
  id: z.string().optional(),
  moduleId: z.string().optional(),
  question: z.string().min(1),
  quiz_options: z.array(QuizOptionSchema).min(1),
});

export default function QuizForm({ wsId, moduleId, data, onFinish }: Props) {
  const t = useTranslations();
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      moduleId,
      question: data?.question || '',
      quiz_options: data?.quiz_options || [{ value: '', is_correct: false }],
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
                  className="border-foreground/20 rounded-md shadow-sm"
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
                            <FormItem className="flex items-center space-x-1 space-y-0">
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
                            className="border-foreground/20 rounded-md shadow-sm"
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
                {index < fields.length - 1 && <Separator />}
              </Fragment>
            ))}
          </div>
        </ScrollArea>

        <Button
          type="button"
          variant="outline"
          onClick={() => append({ value: '', is_correct: false })}
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
