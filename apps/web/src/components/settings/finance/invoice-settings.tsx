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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useTransactionCategories } from '@/hooks/use-transaction-categories';
import { useWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';
import BlockedCreationGroups from './blocked-creation-groups';
import BlockedPendingGroups from './blocked-pending-groups';

interface Props {
  workspaceId: string;
}

export const safeTrim = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : String(v ?? '').trim();

const formSchema = z.object({
  allow_promotions: z.boolean(),
  use_attendance_based: z.boolean(),
  group_pending_by_user: z.boolean(),
  default_group_id: z.string().optional().nullable(),
  default_subscription_category_id: z.string().optional().nullable(),
  blocked_creation_group_ids: z.array(z.string()).optional(),
  blocked_pending_group_ids: z.array(z.string()).optional(),
});

export default function InvoiceSettings({ workspaceId }: Props) {
  const t = useTranslations('ws-finance-settings');
  const queryClient = useQueryClient();

  const { data: promotionsConfig, isLoading: isLoadingPromotions } =
    useWorkspaceConfig<string>(
      workspaceId,
      'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD',
      'true'
    );

  const { data: attendanceConfig, isLoading: isLoadingAttendance } =
    useWorkspaceConfig<string>(
      workspaceId,
      'INVOICE_USE_ATTENDANCE_BASED_CALCULATION',
      'true'
    );

  const { data: groupPendingConfig, isLoading: isLoadingGroupPending } =
    useWorkspaceConfig<string>(
      workspaceId,
      'INVOICE_GROUP_PENDING_INVOICES_BY_USER',
      'false'
    );

  const { data: defaultGroupConfig, isLoading: isLoadingDefaultGroup } =
    useWorkspaceConfig<string | null>(
      workspaceId,
      'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
      null
    );

  const { data: blockedCreationConfig, isLoading: isLoadingBlockedCreation } =
    useWorkspaceConfig<string | null>(
      workspaceId,
      'INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION',
      null
    );

  const { data: blockedPendingConfig, isLoading: isLoadingBlockedPending } =
    useWorkspaceConfig<string | null>(
      workspaceId,
      'INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING',
      null
    );

  const {
    data: defaultSubscriptionCategoryConfig,
    isLoading: isLoadingDefaultSubscriptionCategory,
  } = useWorkspaceConfig<string | null>(
    workspaceId,
    'DEFAULT_SUBSCRIPTION_CATEGORY_ID',
    null
  );

  const { data: groupsData, isLoading: isLoadingGroups } =
    useWorkspaceUserGroups(workspaceId, { includeGuest: true });

  const { data: categoriesData, isLoading: isLoadingCategories } =
    useTransactionCategories(workspaceId);

  const isLoading =
    isLoadingPromotions ||
    isLoadingAttendance ||
    isLoadingGroupPending ||
    isLoadingDefaultGroup ||
    isLoadingBlockedCreation ||
    isLoadingBlockedPending ||
    isLoadingDefaultSubscriptionCategory ||
    isLoadingGroups ||
    isLoadingCategories;

  const availableGroups = useMemo(() => groupsData || [], [groupsData]);
  const availableCategories = useMemo(
    () => categoriesData || [],
    [categoriesData]
  );

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      allow_promotions: true,
      use_attendance_based: true,
      group_pending_by_user: false,
      default_group_id: null,
      default_subscription_category_id: null,
      blocked_creation_group_ids: [],
      blocked_pending_group_ids: [],
    },
    values: useMemo(() => {
      if (isLoading) return undefined;

      const parseIds = (raw: string | null | undefined): string[] =>
        safeTrim(raw)
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);

      return {
        allow_promotions: safeTrim(promotionsConfig).toLowerCase() !== 'false',
        use_attendance_based:
          safeTrim(attendanceConfig).toLowerCase() === 'true',
        group_pending_by_user:
          safeTrim(groupPendingConfig).toLowerCase() === 'true',
        default_group_id: defaultGroupConfig || null,
        default_subscription_category_id:
          defaultSubscriptionCategoryConfig || null,
        blocked_creation_group_ids: parseIds(blockedCreationConfig),
        blocked_pending_group_ids: parseIds(blockedPendingConfig),
      };
    }, [
      isLoading,
      promotionsConfig,
      attendanceConfig,
      groupPendingConfig,
      defaultGroupConfig,
      defaultSubscriptionCategoryConfig,
      blockedCreationConfig,
      blockedPendingConfig,
    ]),
    resetOptions: {
      keepDirtyValues: true,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const serializeIds = (ids: string[] | undefined) =>
        ids
          ? ids
              .map((v) => safeTrim(v))
              .filter(Boolean)
              .join(',')
          : '';

      const updates = [
        {
          key: 'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD',
          value: values.allow_promotions.toString(),
        },
        {
          key: 'INVOICE_USE_ATTENDANCE_BASED_CALCULATION',
          value: values.use_attendance_based.toString(),
        },
        {
          key: 'INVOICE_GROUP_PENDING_INVOICES_BY_USER',
          value: values.group_pending_by_user.toString(),
        },
        {
          key: 'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
          value: safeTrim(values.default_group_id) || '',
        },
        {
          key: 'DEFAULT_SUBSCRIPTION_CATEGORY_ID',
          value: safeTrim(values.default_subscription_category_id) || '',
        },
        {
          key: 'INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION',
          value: serializeIds(values.blocked_creation_group_ids),
        },
        {
          key: 'INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING',
          value: serializeIds(values.blocked_pending_group_ids),
        },
      ];

      const settled = await Promise.allSettled(
        updates.map(async (update) => {
          const res = await fetch(
            `/api/v1/workspaces/${workspaceId}/settings/${update.key}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: update.value }),
            }
          );

          if (!res.ok) throw new Error(`Failed to update ${update.key}`);
          return res.json();
        })
      );

      const rejected = settled.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );
      if (rejected.length > 0) {
        const errors = rejected.map((r) =>
          r.reason instanceof Error ? r.reason : new Error(String(r.reason))
        );

        const AggregateErrorCtor = (
          globalThis as unknown as { AggregateError?: unknown }
        ).AggregateError as
          | (new (
              errors: unknown[],
              message?: string
            ) => Error)
          | undefined;

        throw AggregateErrorCtor
          ? new AggregateErrorCtor(
              errors,
              'Failed to update one or more invoice settings'
            )
          : Object.assign(
              new Error('Failed to update one or more invoice settings'),
              {
                errors,
              }
            );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ['invoice-attendance-config', workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ['pending-invoices', workspaceId],
      });
      toast.success(t('update_success'));
      form.reset(form.getValues());
    },
    onError: () => {
      toast.error(t('update_error'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          workspaceId,
          'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          workspaceId,
          'INVOICE_USE_ATTENDANCE_BASED_CALCULATION',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          workspaceId,
          'INVOICE_GROUP_PENDING_INVOICES_BY_USER',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          workspaceId,
          'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          workspaceId,
          'DEFAULT_SUBSCRIPTION_CATEGORY_ID',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          workspaceId,
          'INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          workspaceId,
          'INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING',
        ],
      });
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
            name="allow_promotions"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('invoice_promotion_label')}
                  </FormLabel>
                  <FormDescription>
                    {t('invoice_promotion_help')}
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
            name="use_attendance_based"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('invoice_attendance_label')}
                  </FormLabel>
                  <FormDescription>
                    {t('invoice_attendance_help')}
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
            name="group_pending_by_user"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('invoice_pending_group_label')}
                  </FormLabel>
                  <FormDescription>
                    {t('invoice_pending_group_help')}
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
            name="default_group_id"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('default_group_label')}
                  </FormLabel>
                  <FormDescription>{t('default_group_help')}</FormDescription>
                </div>
                <FormControl>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Select
                      value={field.value ?? 'none'}
                      onValueChange={(value) =>
                        field.onChange(value === 'none' ? null : value)
                      }
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue
                          placeholder={t('default_group_placeholder')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t('no_default_group')}
                        </SelectItem>
                        {availableGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                            {group.archived ? ` (${t('group_archived')})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="default_subscription_category_id"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('default_subscription_category_label')}
                  </FormLabel>
                  <FormDescription>
                    {t('default_subscription_category_help')}
                  </FormDescription>
                </div>
                <FormControl>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Select
                      value={field.value ?? 'none'}
                      onValueChange={(value) =>
                        field.onChange(value === 'none' ? null : value)
                      }
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue
                          placeholder={t(
                            'default_subscription_category_placeholder'
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t('no_default_group')}
                        </SelectItem>
                        {availableCategories.map((category) => (
                          <SelectItem key={category.id!} value={category.id!}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormControl>
              </FormItem>
            )}
          />

          <BlockedCreationGroups
            workspaceId={workspaceId}
            control={form.control}
          />
          <BlockedPendingGroups
            workspaceId={workspaceId}
            control={form.control}
          />

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                isLoading || updateMutation.isPending || !form.formState.isDirty
              }
            >
              {updateMutation.isPending ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
