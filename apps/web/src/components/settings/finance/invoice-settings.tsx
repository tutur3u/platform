'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@tuturuuu/ui/form';
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
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useWorkspaceConfig } from '@/hooks/use-workspace-config';

interface Props {
  wsId: string;
}

const formSchema = z.object({
  allow_promotions: z.boolean(),
  use_attendance_based: z.boolean(),
  default_group_id: z.string().optional().nullable(),
  blocked_creation_group_ids: z.array(z.string()).optional(),
  blocked_pending_group_ids: z.array(z.string()).optional(),
});

export default function InvoiceSettings({ wsId }: Props) {
  const t = useTranslations('ws-finance-settings');
  const queryClient = useQueryClient();

  const { data: promotionsConfig, isLoading: isLoadingPromotions } =
    useWorkspaceConfig<string>(
      wsId,
      'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD',
      'true'
    );

  const { data: attendanceConfig, isLoading: isLoadingAttendance } =
    useWorkspaceConfig<string>(
      wsId,
      'INVOICE_USE_ATTENDANCE_BASED_CALCULATION',
      'true'
    );

  const { data: defaultGroupConfig } = useWorkspaceConfig<string | null>(
    wsId,
    'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
    null
  );

  const { data: blockedCreationConfig } = useWorkspaceConfig<string | null>(
    wsId,
    'INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION',
    null
  );

  const { data: blockedPendingConfig } = useWorkspaceConfig<string | null>(
    wsId,
    'INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING',
    null
  );

  const { data: groupsData, isLoading: isLoadingGroups } = useQuery({
    queryKey: ['workspace-user-groups', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_user_groups')
        .select('id, name, archived, is_guest')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) {
        console.error(
          'Error fetching workspace user groups for invoice settings:',
          error
        );
        throw error;
      }

      return (data || []) as {
        id: string;
        name: string;
        archived: boolean | null;
        is_guest: boolean | null;
      }[];
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
  });

  const availableGroups = useMemo(() => groupsData || [], [groupsData]);

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      allow_promotions: true,
      use_attendance_based: true,
      default_group_id: null,
      blocked_creation_group_ids: [],
      blocked_pending_group_ids: [],
    },
  });

  useEffect(() => {
    if (
      promotionsConfig !== undefined ||
      attendanceConfig !== undefined ||
      defaultGroupConfig !== undefined ||
      blockedCreationConfig !== undefined ||
      blockedPendingConfig !== undefined
    ) {
      const parseIds = (raw: string | null | undefined): string[] =>
        (raw || '')
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);

      form.reset({
        allow_promotions: promotionsConfig?.trim().toLowerCase() !== 'false',
        use_attendance_based: attendanceConfig?.trim().toLowerCase() === 'true',
        default_group_id: defaultGroupConfig || null,
        blocked_creation_group_ids: parseIds(blockedCreationConfig),
        blocked_pending_group_ids: parseIds(blockedPendingConfig),
      });
    }
  }, [
    promotionsConfig,
    attendanceConfig,
    defaultGroupConfig,
    blockedCreationConfig,
    blockedPendingConfig,
    form,
  ]);

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const serializeIds = (ids: string[] | undefined) =>
        ids
          ? ids
              .map((v) => v.trim())
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
          key: 'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
          value: values.default_group_id?.trim() || '',
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
            `/api/v1/workspaces/${wsId}/settings/${update.key}`,
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
        queryKey: ['workspace-config', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['invoice-attendance-config', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['pending-invoices', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspace-user-groups', wsId],
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
          wsId,
          'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          wsId,
          'INVOICE_USE_ATTENDANCE_BASED_CALCULATION',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          wsId,
          'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          wsId,
          'INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          wsId,
          'INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING',
        ],
      });
    },
  });

  const isLoading =
    isLoadingPromotions || isLoadingAttendance || isLoadingGroups;

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
            name="blocked_creation_group_ids"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('blocked_creation_groups_label')}
                  </FormLabel>
                  <FormDescription>
                    {t('blocked_creation_groups_help')}
                  </FormDescription>
                </div>
                <FormControl>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <div className="flex max-h-52 w-64 flex-col gap-1 overflow-y-auto">
                      {availableGroups.map((group) => {
                        const selected = (field.value ?? []).includes(group.id);
                        return (
                          <label
                            key={group.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => {
                                const current = field.value ?? [];
                                if (checked) {
                                  field.onChange([...current, group.id]);
                                } else {
                                  field.onChange(
                                    current.filter((id) => id !== group.id)
                                  );
                                }
                              }}
                            />
                            <span className="truncate">
                              {group.name}
                              {group.archived
                                ? ` (${t('group_archived')})`
                                : ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="blocked_pending_group_ids"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('blocked_pending_groups_label')}
                  </FormLabel>
                  <FormDescription>
                    {t('blocked_pending_groups_help')}
                  </FormDescription>
                </div>
                <FormControl>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <div className="flex max-h-52 w-64 flex-col gap-1 overflow-y-auto">
                      {availableGroups.map((group) => {
                        const selected = (field.value ?? []).includes(group.id);
                        return (
                          <label
                            key={group.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => {
                                const current = field.value ?? [];
                                if (checked) {
                                  field.onChange([...current, group.id]);
                                } else {
                                  field.onChange(
                                    current.filter((id) => id !== group.id)
                                  );
                                }
                              }}
                            />
                            <span className="truncate">
                              {group.name}
                              {group.archived
                                ? ` (${t('group_archived')})`
                                : ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>
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
