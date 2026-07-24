'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  ATTENDANCE_COUNT_MANAGERS_CONFIG_ID,
  ATTENDANCE_SHOW_MANAGERS_CONFIG_ID,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
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
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
}

const formSchema = z.object({
  count_managers_in_attendance_totals: z.boolean(),
  show_managers_in_attendance: z.boolean(),
});

export default function AttendanceDisplaySettings({ wsId }: Props) {
  const t = useTranslations('ws-attendance-settings');
  const { data: showManagersConfigValue, isLoading: isLoadingShowManagers } =
    useWorkspaceConfig<string>(
      wsId,
      ATTENDANCE_SHOW_MANAGERS_CONFIG_ID,
      'true'
    );
  const { data: countManagersConfigValue, isLoading: isLoadingCountManagers } =
    useWorkspaceConfig<string>(
      wsId,
      ATTENDANCE_COUNT_MANAGERS_CONFIG_ID,
      'true'
    );

  const queryClient = useQueryClient();
  const isLoading = isLoadingShowManagers || isLoadingCountManagers;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      count_managers_in_attendance_totals: true,
      show_managers_in_attendance: true,
    },
    values: useMemo(() => {
      if (
        isLoading ||
        showManagersConfigValue == null ||
        countManagersConfigValue == null
      ) {
        return undefined;
      }

      return {
        count_managers_in_attendance_totals:
          countManagersConfigValue.trim().toLowerCase() !== 'false',
        show_managers_in_attendance:
          showManagersConfigValue.trim().toLowerCase() === 'true',
      };
    }, [isLoading, showManagersConfigValue, countManagersConfigValue]),
    resetOptions: {
      keepDirtyValues: true,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      await Promise.all([
        updateWorkspaceConfig(
          wsId,
          ATTENDANCE_SHOW_MANAGERS_CONFIG_ID,
          values.show_managers_in_attendance.toString()
        ),
        updateWorkspaceConfig(
          wsId,
          ATTENDANCE_COUNT_MANAGERS_CONFIG_ID,
          values.count_managers_in_attendance_totals.toString()
        ),
      ]);
    },
    onSuccess: () => {
      for (const configId of [
        ATTENDANCE_SHOW_MANAGERS_CONFIG_ID,
        ATTENDANCE_COUNT_MANAGERS_CONFIG_ID,
      ]) {
        queryClient.invalidateQueries({
          queryKey: ['workspace-config', wsId, configId],
        });
      }
      queryClient.invalidateQueries({
        queryKey: ['workspace-user-groups', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspace-user-groups-infinite', wsId],
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

          <FormField
            control={form.control}
            name="count_managers_in_attendance_totals"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('count_managers_label')}
                  </FormLabel>
                  <FormDescription>{t('count_managers_help')}</FormDescription>
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
