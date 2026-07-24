'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@tuturuuu/ui/form';
import { useWorkspaceConfigs } from '@tuturuuu/ui/hooks/use-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
}

const formSchema = z.object({
  enable_post_approval: z.boolean(),
  enable_report_approval: z.boolean(),
  enable_report_export_only_approved: z.boolean(),
  enable_report_pending_watermark: z.boolean(),
});

const APPROVAL_CONFIG_IDS = [
  'ENABLE_POST_APPROVAL',
  'ENABLE_REPORT_APPROVAL',
  'ENABLE_REPORT_EXPORT_ONLY_APPROVED',
  'ENABLE_REPORT_PENDING_WATERMARK',
] as const;

function parseBooleanConfig(
  value: string | null | undefined,
  fallback: boolean
) {
  if (value == null) return fallback;

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  return fallback;
}

export function ApprovalsSettings({ wsId }: Props) {
  const t = useTranslations('settings.approvals');
  const queryClient = useQueryClient();

  const { data: approvalConfigs, isLoading: isLoadingApprovalConfigs } =
    useWorkspaceConfigs(wsId, [...APPROVAL_CONFIG_IDS]);

  const {
    data: workspacePermissions,
    isError: isPermissionsError,
    isLoading: isLoadingPermissions,
  } = useQuery<{ manage_workspace_settings: boolean }>({
    queryKey: ['workspace-settings-permissions', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/settings/permissions`,
        {
          cache: 'no-store',
        }
      );

      if (response.status === 403) {
        return {
          manage_workspace_settings: false,
        };
      }

      if (!response.ok) {
        throw new Error('Failed to fetch workspace settings permissions');
      }

      return (await response.json()) as {
        manage_workspace_settings: boolean;
      };
    },
    enabled: !!wsId,
    staleTime: 30_000,
  });

  const isLoading = isLoadingPermissions || isLoadingApprovalConfigs;

  const canManageWorkspaceSettings =
    workspacePermissions?.manage_workspace_settings ?? false;

  type FormValues = z.infer<typeof formSchema>;

  type PendingSummary = {
    pending: {
      posts: number;
      reports: number;
    };
  };

  type UpdateResponse = {
    message: string;
    auto_approved?: {
      posts: number;
      reports: number;
    };
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      enable_post_approval: true,
      enable_report_approval: true,
      enable_report_export_only_approved: false,
      enable_report_pending_watermark: false,
    },
    values: useMemo(() => {
      if (isLoading) return undefined;
      return {
        enable_post_approval: parseBooleanConfig(
          approvalConfigs?.ENABLE_POST_APPROVAL,
          true
        ),
        enable_report_approval: parseBooleanConfig(
          approvalConfigs?.ENABLE_REPORT_APPROVAL,
          true
        ),
        enable_report_export_only_approved: parseBooleanConfig(
          approvalConfigs?.ENABLE_REPORT_EXPORT_ONLY_APPROVED,
          false
        ),
        enable_report_pending_watermark: parseBooleanConfig(
          approvalConfigs?.ENABLE_REPORT_PENDING_WATERMARK,
          false
        ),
      };
    }, [approvalConfigs, isLoading]),
    resetOptions: {
      keepDirtyValues: true,
    },
  });

  const { data: pendingSummary, isError: isPendingSummaryError } =
    useQuery<PendingSummary>({
      queryKey: ['workspace-approvals-pending-summary', wsId],
      queryFn: async () => {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/settings/approvals/pending-summary`,
          {
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch pending approval summary');
        }

        return (await response.json()) as PendingSummary;
      },
      enabled: canManageWorkspaceSettings,
      staleTime: 30_000,
    });

  const enablePostApproval = useWatch({
    control: form.control,
    name: 'enable_post_approval',
  });

  const enableReportApproval = useWatch({
    control: form.control,
    name: 'enable_report_approval',
  });

  const currentPostApprovalEnabled = parseBooleanConfig(
    approvalConfigs?.ENABLE_POST_APPROVAL,
    true
  );
  const currentReportApprovalEnabled = parseBooleanConfig(
    approvalConfigs?.ENABLE_REPORT_APPROVAL,
    true
  );

  const willDisablePostApproval =
    !isLoading && currentPostApprovalEnabled && enablePostApproval === false;
  const willDisableReportApproval =
    !isLoading &&
    currentReportApprovalEnabled &&
    enableReportApproval === false;

  const pendingPostsCount = pendingSummary?.pending.posts ?? 0;
  const pendingReportsCount = pendingSummary?.pending.reports ?? 0;

  const shouldShowAutoApproveWarning =
    ((willDisablePostApproval || willDisableReportApproval) &&
      isPendingSummaryError) ||
    (willDisablePostApproval && pendingPostsCount > 0) ||
    (willDisableReportApproval && pendingReportsCount > 0);

  const isReportApprovalDisabled = enableReportApproval === false;

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      try {
        const res = await fetch(`/api/v1/workspaces/${wsId}/settings/configs`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ENABLE_POST_APPROVAL: values.enable_post_approval.toString(),
            ENABLE_REPORT_APPROVAL: values.enable_report_approval.toString(),
            ENABLE_REPORT_EXPORT_ONLY_APPROVED:
              values.enable_report_export_only_approved.toString(),
            ENABLE_REPORT_PENDING_WATERMARK:
              values.enable_report_pending_watermark.toString(),
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to update settings');
        }

        return (await res.json()) as UpdateResponse;
      } finally {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['workspace-config', wsId],
          }),
          queryClient.invalidateQueries({
            queryKey: ['workspace-configs', wsId],
          }),
          queryClient.invalidateQueries({
            queryKey: ['workspace-approvals-pending-summary', wsId],
          }),
          queryClient.invalidateQueries({
            queryKey: ['ws', wsId, 'approvals', 'reports'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['ws', wsId, 'approvals', 'posts'],
          }),
        ]);
      }
    },
    onSuccess: (data) => {
      toast.success(t('update_success'));

      const autoApprovedPosts = data.auto_approved?.posts ?? 0;
      const autoApprovedReports = data.auto_approved?.reports ?? 0;
      const autoApprovedTotal = autoApprovedPosts + autoApprovedReports;

      if (autoApprovedTotal > 0) {
        toast.warning(
          t('auto_approved_pending_toast', {
            count: autoApprovedTotal,
            posts: autoApprovedPosts,
            reports: autoApprovedReports,
          })
        );
      }

      form.reset(form.getValues());
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  if (isPermissionsError) {
    return (
      <Alert>
        <AlertDescription>{t('permissions_load_error')}</AlertDescription>
      </Alert>
    );
  }

  if (!isLoadingPermissions && !canManageWorkspaceSettings) {
    return (
      <Alert>
        <AlertDescription>{t('insufficient_permissions')}</AlertDescription>
      </Alert>
    );
  }

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
                      onCheckedChange={(checked) => {
                        field.onChange(checked);

                        if (!checked) {
                          form.setValue(
                            'enable_report_export_only_approved',
                            false,
                            { shouldDirty: true }
                          );
                          form.setValue(
                            'enable_report_pending_watermark',
                            false,
                            { shouldDirty: true }
                          );
                        }
                      }}
                    />
                  )}
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="enable_report_export_only_approved"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('enable_report_export_only_approved')}
                  </FormLabel>
                  <FormDescription>
                    {t('enable_report_export_only_approved_description')}
                    {isReportApprovalDisabled && (
                      <span className="mt-1 block">
                        {t('requires_report_approval_enabled')}
                      </span>
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch
                      checked={field.value}
                      disabled={isReportApprovalDisabled}
                      onCheckedChange={field.onChange}
                    />
                  )}
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="enable_report_pending_watermark"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('enable_report_pending_watermark')}
                  </FormLabel>
                  <FormDescription>
                    {t('enable_report_pending_watermark_description')}
                    {isReportApprovalDisabled && (
                      <span className="mt-1 block">
                        {t('requires_report_approval_enabled')}
                      </span>
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch
                      checked={field.value}
                      disabled={isReportApprovalDisabled}
                      onCheckedChange={field.onChange}
                    />
                  )}
                </FormControl>
              </FormItem>
            )}
          />

          {shouldShowAutoApproveWarning && (
            <Alert>
              <AlertDescription>
                <div className="space-y-2 text-sm">
                  <p className="font-medium">
                    {t('pending_auto_approve_warning_title')}
                  </p>
                  <p>{t('pending_auto_approve_warning_description')}</p>
                  {(willDisablePostApproval || willDisableReportApproval) &&
                    isPendingSummaryError && (
                      <p>{t('pending_auto_approve_warning_unknown')}</p>
                    )}
                  {willDisablePostApproval && pendingPostsCount > 0 && (
                    <p>
                      {t('pending_auto_approve_posts_count', {
                        count: pendingPostsCount,
                      })}
                    </p>
                  )}
                  {willDisableReportApproval && pendingReportsCount > 0 && (
                    <p>
                      {t('pending_auto_approve_reports_count', {
                        count: pendingReportsCount,
                      })}
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

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
