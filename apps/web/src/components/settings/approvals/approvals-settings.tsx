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
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
}

const formSchema = z.object({
  enable_post_approval: z.boolean(),
  enable_report_approval: z.boolean(),
});

export function ApprovalsSettings({ wsId }: Props) {
  const t = useTranslations('settings.approvals');
  const queryClient = useQueryClient();

  const { data: enablePostApprovalConfig, isLoading: isLoadingPostApproval } =
    useWorkspaceConfig<string>(wsId, 'ENABLE_POST_APPROVAL', 'true');

  const {
    data: enableReportApprovalConfig,
    isLoading: isLoadingReportApproval,
  } = useWorkspaceConfig<string>(wsId, 'ENABLE_REPORT_APPROVAL', 'true');

  const isLoading = isLoadingPostApproval || isLoadingReportApproval;

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      enable_post_approval: true,
      enable_report_approval: true,
    },
    values: useMemo(() => {
      if (isLoading) return undefined;
      return {
        enable_post_approval:
          enablePostApprovalConfig?.trim().toLowerCase() === 'true',
        enable_report_approval:
          enableReportApprovalConfig?.trim().toLowerCase() === 'true',
      };
    }, [isLoading, enablePostApprovalConfig, enableReportApprovalConfig]),
    resetOptions: {
      keepDirtyValues: true,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const promises = [
        fetch(`/api/v1/workspaces/${wsId}/settings/ENABLE_POST_APPROVAL`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value: values.enable_post_approval.toString(),
          }),
        }),
        fetch(`/api/v1/workspaces/${wsId}/settings/ENABLE_REPORT_APPROVAL`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value: values.enable_report_approval.toString(),
          }),
        }),
      ];

      const results = await Promise.all(promises);

      for (const res of results) {
        if (!res.ok) throw new Error('Failed to update settings');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', wsId],
      });
      toast.success(t('update_success'));
      form.reset(form.getValues());
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="enable_post_approval"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('enable_post_approval')}
                  </FormLabel>
                  <FormDescription>
                    {t('enable_post_approval_description')}
                  </FormDescription>
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
            name="enable_report_approval"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('enable_report_approval')}
                  </FormLabel>
                  <FormDescription>
                    {t('enable_report_approval_description')}
                  </FormDescription>
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
