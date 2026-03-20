'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceTimeThreshold } from '@tuturuuu/hooks';
import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

interface TimeTrackerRequestsSettingsProps {
  wsId: string;
  canManageWorkspaceSettings: boolean;
}

const thresholdSchema = z.coerce
  .number({ message: 'Please enter a valid number' })
  .int('Threshold must be a whole number')
  .min(0, 'Threshold must be 0 or greater');

const formSchema = z.object({
  noApprovalNeeded: z.boolean(),
  threshold: z.string(),
  statusChangeGracePeriodMinutes: z.string(),
});

export function TimeTrackerRequestsSettings({
  wsId,
  canManageWorkspaceSettings,
}: TimeTrackerRequestsSettingsProps) {
  const t = useTranslations('time-tracker.requests.settings');
  const queryClient = useQueryClient();
  const statusChangeGracePeriodConfigId =
    'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES';

  const { data: thresholdData, isLoading: isThresholdLoading } =
    useWorkspaceTimeThreshold(wsId);

  const {
    data: statusChangeGracePeriodValue,
    isLoading: isGracePeriodLoading,
  } = useWorkspaceConfig<string>(wsId, statusChangeGracePeriodConfigId);

  const hasLoadedGracePeriod = statusChangeGracePeriodValue !== undefined;
  const initialGracePeriodValue = statusChangeGracePeriodValue ?? '0';

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      noApprovalNeeded: true,
      threshold: '1',
      statusChangeGracePeriodMinutes: '0',
    },
    values: useMemo(() => {
      if (isThresholdLoading || !hasLoadedGracePeriod) return undefined;

      const currentThreshold = thresholdData?.threshold ?? null;
      return {
        noApprovalNeeded: currentThreshold === null,
        threshold: currentThreshold === null ? '1' : String(currentThreshold),
        statusChangeGracePeriodMinutes: initialGracePeriodValue,
      };
    }, [
      isThresholdLoading,
      hasLoadedGracePeriod,
      thresholdData?.threshold,
      initialGracePeriodValue,
    ]),
    resetOptions: {
      keepDirtyValues: true,
    },
  });

  const noApprovalNeeded = useWatch({
    control: form.control,
    name: 'noApprovalNeeded',
  });
  const statusChangeGracePeriodMinutes = useWatch({
    control: form.control,
    name: 'statusChangeGracePeriodMinutes',
  });
  const parsedGracePeriod = thresholdSchema.safeParse(
    statusChangeGracePeriodMinutes
  );

  const updateThresholdMutation = useMutation({
    mutationFn: async (values: {
      threshold: number | null;
      statusChangeGracePeriodMinutes: number;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/threshold`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(values),
        }
      );

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error || 'Failed to update threshold');
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['workspace-time-threshold', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['workspace-config', wsId, statusChangeGracePeriodConfigId],
        }),
      ]);
      toast.success(t('success'));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('error'));
    },
  });

  const isSubmitDisabled =
    updateThresholdMutation.isPending ||
    isThresholdLoading ||
    !hasLoadedGracePeriod ||
    !canManageWorkspaceSettings ||
    !form.formState.isDirty ||
    !parsedGracePeriod.success;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!canManageWorkspaceSettings) {
      toast.error(t('requiresManageWorkspaceSettings'));
      return;
    }

    const parsedGracePeriodInput = thresholdSchema.safeParse(
      values.statusChangeGracePeriodMinutes
    );

    if (!parsedGracePeriodInput.success) {
      form.setError('statusChangeGracePeriodMinutes', {
        message: parsedGracePeriodInput.error.issues[0]?.message,
      });
      return;
    }

    let thresholdValue: number | null = null;
    if (!values.noApprovalNeeded) {
      const parsedThreshold = thresholdSchema.safeParse(values.threshold);

      if (!parsedThreshold.success) {
        form.setError('threshold', {
          message: parsedThreshold.error.issues[0]?.message,
        });
        return;
      }

      thresholdValue = parsedThreshold.data;
    }

    await updateThresholdMutation.mutateAsync({
      threshold: thresholdValue,
      statusChangeGracePeriodMinutes: parsedGracePeriodInput.data,
    });

    form.reset(values);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium text-lg">{t('title')}</h3>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="noApprovalNeeded"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('noApprovalNeeded')}
                  </FormLabel>
                  <FormDescription>{t('noApprovalHint')}</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={!canManageWorkspaceSettings || isThresholdLoading}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {!noApprovalNeeded && (
            <FormField
              control={form.control}
              name="threshold"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">{t('label')}</FormLabel>
                    <FormDescription>{t('help')}</FormDescription>
                  </div>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      {isThresholdLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          {...field}
                          disabled={!canManageWorkspaceSettings}
                          className="w-24"
                        />
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="statusChangeGracePeriodMinutes"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('statusChangeGracePeriodLabel')}
                  </FormLabel>
                  <FormDescription>
                    {t('statusChangeGracePeriodHelp')}
                  </FormDescription>
                </div>
                <FormControl>
                  <div className="flex items-center gap-2">
                    {isGracePeriodLoading || isThresholdLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        disabled={!canManageWorkspaceSettings}
                        className="w-24"
                      />
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isSubmitDisabled}>
            {updateThresholdMutation.isPending ? t('saving') : t('save')}
          </Button>
        </form>
      </Form>
    </div>
  );
}
