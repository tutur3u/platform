'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useWorkspaceConfigs } from '@tuturuuu/ui/hooks/use-workspace-config';
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
import { useEffect, useMemo, useState } from 'react';
import { useTransactionCategories } from '@/hooks/use-transaction-categories';
import { useWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';
import BlockedCreationGroups from './blocked-creation-groups';
import BlockedPendingGroups from './blocked-pending-groups';

interface Props {
  workspaceId: string;
}

export const safeTrim = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : String(v ?? '').trim();

export default function InvoiceSettings({ workspaceId }: Props) {
  const t = useTranslations('ws-finance-settings');
  const queryClient = useQueryClient();

  const configKeys = [
    'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD',
    'INVOICE_USE_ATTENDANCE_BASED_CALCULATION',
    'INVOICE_GROUP_PENDING_INVOICES_BY_USER',
    'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
    'INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION',
    'INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING',
    'DEFAULT_SUBSCRIPTION_CATEGORY_ID',
  ];

  const { data: configs, isLoading: isLoadingConfigs } = useWorkspaceConfigs(
    workspaceId,
    configKeys
  );

  const { data: groupsData, isLoading: isLoadingGroups } =
    useWorkspaceUserGroups(workspaceId, { includeGuest: true });

  const { data: categoriesData, isLoading: isLoadingCategories } =
    useTransactionCategories(workspaceId);

  const isLoading = isLoadingConfigs || isLoadingGroups || isLoadingCategories;

  const availableGroups = useMemo(() => groupsData || [], [groupsData]);
  const availableCategories = useMemo(
    () => categoriesData || [],
    [categoriesData]
  );

  const [initialized, setInitialized] = useState(false);

  const [initialValues, setInitialValues] = useState({
    allow_promotions: true,
    use_attendance_based: true,
    group_pending_by_user: false,
    default_group_id: null as string | null,
    default_subscription_category_id: null as string | null,
    blocked_creation_group_ids: [] as string[],
    blocked_pending_group_ids: [] as string[],
  });

  const [currentValues, setCurrentValues] = useState(initialValues);

  useEffect(() => {
    if (isLoading) return;

    const parseIds = (raw: string | null | undefined): string[] =>
      safeTrim(raw)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

    const values = {
      allow_promotions:
        safeTrim(
          configs?.INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD ?? 'true'
        ).toLowerCase() !== 'false',
      use_attendance_based:
        safeTrim(
          configs?.INVOICE_USE_ATTENDANCE_BASED_CALCULATION ?? 'true'
        ).toLowerCase() === 'true',
      group_pending_by_user:
        safeTrim(
          configs?.INVOICE_GROUP_PENDING_INVOICES_BY_USER ?? 'false'
        ).toLowerCase() === 'true',
      default_group_id: configs?.DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS || null,
      default_subscription_category_id:
        configs?.DEFAULT_SUBSCRIPTION_CATEGORY_ID || null,
      blocked_creation_group_ids: parseIds(
        configs?.INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION
      ),
      blocked_pending_group_ids: parseIds(
        configs?.INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING
      ),
    };

    setInitialValues(values);
    if (!initialized) {
      setCurrentValues(values);
      setInitialized(true);
    }
  }, [isLoading, configs, initialized]);

  const updateMutation = useMutation({
    mutationFn: async (values: typeof currentValues) => {
      const serializeIds = (ids: string[] | undefined) =>
        ids
          ? ids
              .map((v) => safeTrim(v))
              .filter(Boolean)
              .join(',')
          : '';

      const potentialUpdates = [
        {
          key: 'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD',
          value: values.allow_promotions.toString(),
          initial: initialValues.allow_promotions.toString(),
        },
        {
          key: 'INVOICE_USE_ATTENDANCE_BASED_CALCULATION',
          value: values.use_attendance_based.toString(),
          initial: initialValues.use_attendance_based.toString(),
        },
        {
          key: 'INVOICE_GROUP_PENDING_INVOICES_BY_USER',
          value: values.group_pending_by_user.toString(),
          initial: initialValues.group_pending_by_user.toString(),
        },
        {
          key: 'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
          value: safeTrim(values.default_group_id) || '',
          initial: safeTrim(initialValues.default_group_id) || '',
        },
        {
          key: 'DEFAULT_SUBSCRIPTION_CATEGORY_ID',
          value: safeTrim(values.default_subscription_category_id) || '',
          initial:
            safeTrim(initialValues.default_subscription_category_id) || '',
        },
        {
          key: 'INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION',
          value: serializeIds(values.blocked_creation_group_ids),
          initial: serializeIds(initialValues.blocked_creation_group_ids),
        },
        {
          key: 'INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING',
          value: serializeIds(values.blocked_pending_group_ids),
          initial: serializeIds(initialValues.blocked_pending_group_ids),
        },
      ];

      const updates = potentialUpdates.reduce(
        (acc, { key, value, initial }) => {
          if (value !== initial) {
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, string>
      );

      if (Object.keys(updates).length === 0) return;

      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/settings/configs`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update invoice settings');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-configs', workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ['invoice-attendance-config', workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ['pending-invoices', workspaceId],
      });
      toast.success(t('update_success'));
      setInitialValues(currentValues);
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  if (!initialized) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isDirty =
    JSON.stringify(currentValues) !== JSON.stringify(initialValues);

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateMutation.mutate(currentValues);
        }}
        className="space-y-4"
      >
        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <div className="font-medium text-base">
              {t('invoice_promotion_label')}
            </div>
            <div className="text-muted-foreground text-sm">
              {t('invoice_promotion_help')}
            </div>
          </div>
          <div>
            <Switch
              checked={currentValues.allow_promotions}
              onCheckedChange={(checked) =>
                setCurrentValues((prev) => ({
                  ...prev,
                  allow_promotions: checked,
                }))
              }
            />
          </div>
        </div>

        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <div className="font-medium text-base">
              {t('invoice_attendance_label')}
            </div>
            <div className="text-muted-foreground text-sm">
              {t('invoice_attendance_help')}
            </div>
          </div>
          <div>
            <Switch
              checked={currentValues.use_attendance_based}
              onCheckedChange={(checked) =>
                setCurrentValues((prev) => ({
                  ...prev,
                  use_attendance_based: checked,
                }))
              }
            />
          </div>
        </div>

        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <div className="font-medium text-base">
              {t('invoice_pending_group_label')}
            </div>
            <div className="text-muted-foreground text-sm">
              {t('invoice_pending_group_help')}
            </div>
          </div>
          <div>
            <Switch
              checked={currentValues.group_pending_by_user}
              onCheckedChange={(checked) =>
                setCurrentValues((prev) => ({
                  ...prev,
                  group_pending_by_user: checked,
                }))
              }
            />
          </div>
        </div>

        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <div className="font-medium text-base">
              {t('default_group_label')}
            </div>
            <div className="text-muted-foreground text-sm">
              {t('default_group_help')}
            </div>
          </div>
          <Select
            value={currentValues.default_group_id ?? 'none'}
            onValueChange={(value) =>
              setCurrentValues((prev) => ({
                ...prev,
                default_group_id: value === 'none' ? null : value,
              }))
            }
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder={t('default_group_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('no_default_group')}</SelectItem>
              {availableGroups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                  {group.archived ? ` (${t('group_archived')})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <div className="font-medium text-base">
              {t('default_subscription_category_label')}
            </div>
            <div className="text-muted-foreground text-sm">
              {t('default_subscription_category_help')}
            </div>
          </div>
          <Select
            value={currentValues.default_subscription_category_id ?? 'none'}
            onValueChange={(value) =>
              setCurrentValues((prev) => ({
                ...prev,
                default_subscription_category_id:
                  value === 'none' ? null : value,
              }))
            }
          >
            <SelectTrigger className="w-64">
              <SelectValue
                placeholder={t('default_subscription_category_placeholder')}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('no_default_group')}</SelectItem>
              {availableCategories.map((category) => (
                <SelectItem key={category.id!} value={category.id!}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <BlockedCreationGroups
          workspaceId={workspaceId}
          value={currentValues.blocked_creation_group_ids}
          onChange={(val) =>
            setCurrentValues((prev) => ({
              ...prev,
              blocked_creation_group_ids: val as string[],
            }))
          }
        />
        <BlockedPendingGroups
          workspaceId={workspaceId}
          value={currentValues.blocked_pending_group_ids}
          onChange={(val) =>
            setCurrentValues((prev) => ({
              ...prev,
              blocked_pending_group_ids: val as string[],
            }))
          }
        />

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isLoading || updateMutation.isPending || !isDirty}
          >
            {updateMutation.isPending ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
