'use client';

import { useMutation } from '@tanstack/react-query';
import { Circle } from '@tuturuuu/icons';
import {
  createWorkspaceCourseModule,
  updateWorkspaceCourseModule,
} from '@tuturuuu/internal-api';
import type { WorkspaceCourseModule } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import * as z from 'zod';

interface ModuleGroupOption {
  id: string;
  title: string;
  icon?: string | null;
  color?: string | null;
}

interface Props {
  wsId: string;
  courseId: string;
  data?: WorkspaceCourseModule;
  defaultModuleGroupId?: string;
  moduleGroups?: ModuleGroupOption[];

  onCreated?: (data: WorkspaceCourseModule) => void;
  onFinish?: () => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  module_group_id: z.string().uuid(),
  name: z.string().min(1),
});

export function CourseModuleForm({
  wsId,
  courseId,
  data,
  defaultModuleGroupId,
  moduleGroups,
  onCreated,
  onFinish,
}: Props) {
  const t = useTranslations('ws-course-modules');
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      module_group_id: data?.module_group_id || defaultModuleGroupId || '',
      name: data?.name || '',
    },
  });

  useEffect(() => {
    form.reset({
      id: data?.id,
      module_group_id: data?.module_group_id || defaultModuleGroupId || '',
      name: data?.name || '',
    });
  }, [data, defaultModuleGroupId, form]);

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const saveMutation = useMutation({
    mutationFn: async (payload: z.infer<typeof FormSchema>) => {
      if (payload.id) {
        await updateWorkspaceCourseModule(wsId, payload.id, payload);
        return undefined;
      }
      return createWorkspaceCourseModule(wsId, courseId, payload);
    },
  });

  const disabled =
    !isDirty || !isValid || isSubmitting || saveMutation.isPending;

  const onSubmit = async (payload: z.infer<typeof FormSchema>) => {
    try {
      const result = await saveMutation.mutateAsync(payload);
      if (result && onCreated) {
        onCreated(result);
      } else {
        router.refresh();
      }
      onFinish?.();
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
        {!data?.id && moduleGroups && moduleGroups.length > 0 && (
          <FormField
            control={form.control}
            name="module_group_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('module_group')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('select_group')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {moduleGroups.map((group) => {
                      const GroupIcon =
                        getIconComponentByKey(
                          group.icon as PlatformIconKey | null
                        ) ?? Circle;
                      const colorStyles = computeAccessibleLabelStyles(
                        group.color || '#64748b'
                      );
                      return (
                        <SelectItem key={group.id} value={group.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                              style={
                                colorStyles
                                  ? {
                                      backgroundColor: colorStyles.bg,
                                      borderColor: colorStyles.border,
                                      borderWidth: '1px',
                                    }
                                  : undefined
                              }
                            >
                              <GroupIcon
                                className="h-3 w-3"
                                style={
                                  colorStyles
                                    ? { color: colorStyles.text }
                                    : undefined
                                }
                              />
                            </div>
                            <span>{group.title}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {data?.id && (
          <input type="hidden" {...form.register('module_group_id')} />
        )}

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
