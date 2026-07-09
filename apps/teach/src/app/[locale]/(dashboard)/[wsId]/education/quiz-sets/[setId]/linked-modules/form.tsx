'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceCourseModule,
  updateWorkspaceCourseModule,
} from '@tuturuuu/internal-api';
import type { WorkspaceCourseModule } from '@tuturuuu/types';
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
import { useTranslations } from 'next-intl';
import * as z from 'zod';

interface Props {
  wsId: string;
  courseId: string;
  moduleGroupId?: string;
  data?: Partial<WorkspaceCourseModule>;

  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  module_group_id: z.string().uuid(),
  name: z.string().min(1),
});

export default function CourseModuleForm({
  wsId,
  courseId,
  moduleGroupId,
  data,
  onFinish,
}: Props) {
  const t = useTranslations('ws-course-modules');
  const queryClient = useQueryClient();
  const parsedModuleGroupId = z.string().uuid().safeParse(moduleGroupId);
  const resolvedModuleGroupId =
    data?.module_group_id ??
    (parsedModuleGroupId.success ? parsedModuleGroupId.data : undefined);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      module_group_id: resolvedModuleGroupId ?? undefined,
      name: data?.name || '',
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const saveMutation = useMutation({
    mutationFn: async (payload: z.infer<typeof FormSchema>) => {
      if (payload.id) {
        await updateWorkspaceCourseModule(wsId, payload.id, payload);
        return;
      }
      await createWorkspaceCourseModule(wsId, courseId, payload);
    },
  });

  const disabled =
    !isDirty || !isValid || isSubmitting || saveMutation.isPending;

  const onSubmit = async (payload: z.infer<typeof FormSchema>) => {
    try {
      await saveMutation.mutateAsync(payload);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['workspaceCourseModuleGroups', wsId, courseId],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'workspaceCourseModuleGroupModules',
            wsId,
            courseId,
            payload.module_group_id,
          ],
        }),
      ]);
      onFinish?.(payload);
    } catch (error) {
      toast({
        title: `Failed to ${payload.id ? 'edit' : 'create'} course module`,
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
        <input type="hidden" {...form.register('module_group_id')} />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input placeholder={t('name')} autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled}>
          {data?.id ? t('edit') : t('create')}
        </Button>
      </form>
    </Form>
  );
}
