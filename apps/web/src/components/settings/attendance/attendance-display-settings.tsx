'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@tuturuuu/ui/form';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
}

const formSchema = z.object({
  show_managers_in_attendance: z.boolean(),
});

export default function AttendanceDisplaySettings({ wsId }: Props) {
  const t = useTranslations('ws-attendance-settings');
  const { data: configValue, isLoading } = useWorkspaceConfig<string>(
    wsId,
    'ATTENDANCE_SHOW_MANAGERS',
    'true'
  );

  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      show_managers_in_attendance: true,
    },
  });

  useEffect(() => {
    if (configValue !== undefined) {
      const value = configValue.trim().toLowerCase() === 'true';
      form.reset({
        show_managers_in_attendance: value,
      });
    }
  }, [configValue, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/ATTENDANCE_SHOW_MANAGERS`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value: values.show_managers_in_attendance.toString(),
          }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update settings');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', wsId, 'ATTENDANCE_SHOW_MANAGERS'],
      });
      toast.success(t('update_success'));
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateMutation.mutate(values);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium text-lg">{t('display_title')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('display_description')}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="show_managers_in_attendance"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('show_managers_label')}
                  </FormLabel>
                  <FormDescription>{t('show_managers_help')}</FormDescription>
                </div>
                <FormControl>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                </FormControl>
              </FormItem>
            )}
          />

          <Button
            type="submit"
            disabled={
              isLoading || updateMutation.isPending || !form.formState.isDirty
            }
          >
            {updateMutation.isPending ? t('saving') : t('save')}
          </Button>
        </form>
      </Form>
    </div>
  );
}
