'use client';

import { useMutation } from '@tanstack/react-query';
import {
  createWorkspaceQuizSet,
  updateWorkspaceQuizSet,
} from '@tuturuuu/internal-api';
import type { WorkspaceQuizSet } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as z from 'zod';

interface Props {
  wsId: string;
  moduleId?: string;
  data?: WorkspaceQuizSet;

  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  moduleId: z.string().optional(),
});

export default function CourseModuleForm({
  wsId,
  moduleId,
  data,
  onFinish,
}: Props) {
  const t = useTranslations();
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
      moduleId,
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const saveMutation = useMutation({
    mutationFn: async (payload: z.infer<typeof FormSchema>) => {
      if (payload.id) {
        await updateWorkspaceQuizSet(wsId, payload.id, payload);
        return;
      }
      await createWorkspaceQuizSet(wsId, payload);
    },
  });

  const disabled =
    !isDirty || !isValid || isSubmitting || saveMutation.isPending;

  const onSubmit = async (payload: z.infer<typeof FormSchema>) => {
    try {
      await saveMutation.mutateAsync(payload);
      onFinish?.(payload);
      router.refresh();
    } catch (error) {
      toast({
        title: `Failed to ${payload.id ? 'edit' : 'create'} quiz set`,
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-quiz-sets.name')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('ws-quiz-sets.name')}
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled}>
          {data?.id ? t('ws-quiz-sets.edit') : t('ws-quiz-sets.create')}
        </Button>
      </form>
    </Form>
  );
}
