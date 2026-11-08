'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  DENIED_WORKSPACE_PERMISSIONS,
  getWorkspacePermissionsSummary,
  type WorkspacePermissionsSummary,
} from '@tuturuuu/internal-api/settings';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionFooter,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
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
  } = useQuery<WorkspacePermissionsSummary>({
    // Shared with the workspace settings dialog, which reads the member and
    // role flags off this same entry. Anything cached here must be the whole
    // summary: a narrower object would leave those flags undefined, and the
    // dialog reads them as `?? false` and locks itself to read-only.
    queryKey: ['workspace-settings-permissions', wsId],
    queryFn: async () => {
      try {
        return await getWorkspacePermissionsSummary(wsId);
      } catch (error) {
        // Not a member of this workspace: a denial, not a failure to load.
        if (error instanceof InternalApiError && error.status === 403) {
          return DENIED_WORKSPACE_PERMISSIONS;
        }

        throw error;
      }
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
      <SettingsSection>
        <SettingsSectionMessage role="alert" tone="default">
          {t('permissions_load_error')}
        </SettingsSectionMessage>
      </SettingsSection>
    );
  }

  if (!isLoadingPermissions && !canManageWorkspaceSettings) {
    return (
      <SettingsSection>
        <SettingsSectionMessage role="alert" tone="default">
          {t('insufficient_permissions')}
        </SettingsSectionMessage>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection>
      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))}>
          <FormField
            control={form.control}
            name="enable_post_approval"
            render={({ field }) => (
              <FormItem className="gap-0">
                <SettingItemTab
                  title={<FormLabel>{t('enable_post_approval')}</FormLabel>}
                  description={
                    <FormDescription>
                      {t('enable_post_approval_description')}
                    </FormDescription>
                  }
                >
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
                </SettingItemTab>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="enable_report_approval"
            render={({ field }) => (
              <FormItem className="gap-0">
                <SettingItemTab
                  title={<FormLabel>{t('enable_report_approval')}</FormLabel>}
                  description={
                    <FormDescription>
                      {t('enable_report_approval_description')}
                    </FormDescription>
                  }
                >
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
                </SettingItemTab>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="enable_report_export_only_approved"
            render={({ field }) => (
              <FormItem className="gap-0">
                <SettingItemTab
                  title={
                    <FormLabel>
                      {t('enable_report_export_only_approved')}
                    </FormLabel>
                  }
                  description={
                    <FormDescription>
                      {isReportApprovalDisabled
                        ? `${t('enable_report_export_only_approved_description')}\n${t('requires_report_approval_enabled')}`
                        : t('enable_report_export_only_approved_description')}
                    </FormDescription>
                  }
                >
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
                </SettingItemTab>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="enable_report_pending_watermark"
            render={({ field }) => (
              <FormItem className="gap-0">
                <SettingItemTab
                  title={
                    <FormLabel>
                      {t('enable_report_pending_watermark')}
                    </FormLabel>
                  }
                  description={
                    <FormDescription>
                      {isReportApprovalDisabled
                        ? `${t('enable_report_pending_watermark_description')}\n${t('requires_report_approval_enabled')}`
                        : t('enable_report_pending_watermark_description')}
                    </FormDescription>
                  }
                >
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
                </SettingItemTab>
              </FormItem>
            )}
          />

          {shouldShowAutoApproveWarning && (
            <SettingsSectionMessage
              className="py-4"
              role="alert"
              tone="default"
            >
              <div className="space-y-1">
                <p className="font-medium text-dynamic-yellow">
                  {t('pending_auto_approve_warning_title')}
                </p>
                <p className="text-muted-foreground">
                  {t('pending_auto_approve_warning_description')}
                </p>
                {(willDisablePostApproval || willDisableReportApproval) &&
                  isPendingSummaryError && (
                    <p className="text-muted-foreground">
                      {t('pending_auto_approve_warning_unknown')}
                    </p>
                  )}
                {willDisablePostApproval && pendingPostsCount > 0 && (
                  <p className="text-muted-foreground">
                    {t('pending_auto_approve_posts_count', {
                      count: pendingPostsCount,
                    })}
                  </p>
                )}
                {willDisableReportApproval && pendingReportsCount > 0 && (
                  <p className="text-muted-foreground">
                    {t('pending_auto_approve_reports_count', {
                      count: pendingReportsCount,
                    })}
                  </p>
                )}
              </div>
            </SettingsSectionMessage>
          )}

          <SettingsSectionFooter>
            <Button
              type="submit"
              disabled={
                isLoading || updateMutation.isPending || !form.formState.isDirty
              }
            >
              {updateMutation.isPending ? t('saving') : t('save')}
            </Button>
          </SettingsSectionFooter>
        </form>
      </Form>
    </SettingsSection>
  );
}
