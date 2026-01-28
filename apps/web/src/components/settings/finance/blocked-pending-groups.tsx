'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@tuturuuu/ui/form';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { type Control, useWatch } from 'react-hook-form';
import { useWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';

interface Props {
  workspaceId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
}

export default function BlockedPendingGroups({ workspaceId, control }: Props) {
  const t = useTranslations('ws-finance-settings');

  const { data: groupsData, isLoading: isLoadingGroups } =
    useWorkspaceUserGroups(workspaceId);

  const selectedGroupIds =
    useWatch({
      control,
      name: 'blocked_pending_group_ids',
    }) || [];

  const groupOptions: ComboboxOption[] = useMemo(() => {
    const selectedSet = new Set(selectedGroupIds);
    return (groupsData || [])
      .map((group) => ({
        value: group.id,
        label: group.name + (group.archived ? ` (${t('group_archived')})` : ''),
      }))
      .sort((a, b) => {
        const aSelected = selectedSet.has(a.value as string);
        const bSelected = selectedSet.has(b.value as string);
        if (aSelected === bSelected) return 0;
        return aSelected ? -1 : 1;
      });
  }, [groupsData, selectedGroupIds, t]);

  return (
    <FormField
      control={control}
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
            {isLoadingGroups ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Combobox
                mode="multiple"
                options={groupOptions}
                selected={field.value ?? []}
                onChange={field.onChange}
                placeholder={t('blocked_groups_placeholder')}
                searchPlaceholder={t('search_groups')}
                emptyText={t('no_groups_found')}
                label={
                  field.value && field.value.length > 2
                    ? t('selected_groups_count', {
                        count: field.value.length,
                      })
                    : undefined
                }
                className="w-64"
              />
            )}
          </FormControl>
        </FormItem>
      )}
    />
  );
}
