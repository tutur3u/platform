'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';

interface Props {
  workspaceId: string;
  value: string[];
  onChange: (value: string | string[]) => void;
}

export default function BlockedPendingGroups({
  workspaceId,
  value,
  onChange,
}: Props) {
  const t = useTranslations('ws-finance-settings');

  const { data: groupsData, isLoading: isLoadingGroups } =
    useWorkspaceUserGroups(workspaceId);

  const groupOptions: ComboboxOption[] = useMemo(() => {
    return (groupsData || [])
      .map((group) => ({
        value: group.id,
        label: group.name + (group.archived ? ` (${t('group_archived')})` : ''),
      }))
      .sort((a, b) => {
        const aSelected = value.includes(a.value as string);
        const bSelected = value.includes(b.value as string);
        if (aSelected === bSelected) return 0;
        return aSelected ? -1 : 1;
      });
  }, [groupsData, value, t]);

  return (
    <div className="flex flex-row items-center justify-between rounded-lg border p-4">
      <div className="space-y-0.5">
        <div className="font-medium text-base">
          {t('blocked_pending_groups_label')}
        </div>
        <div className="text-muted-foreground text-sm">
          {t('blocked_pending_groups_help')}
        </div>
      </div>
      <div>
        {isLoadingGroups ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Combobox
            mode="multiple"
            options={groupOptions}
            selected={value}
            onChange={onChange}
            placeholder={t('blocked_groups_placeholder')}
            searchPlaceholder={t('search_groups')}
            emptyText={t('no_groups_found')}
            label={
              value.length > 2
                ? t('selected_groups_count', {
                    count: value.length,
                  })
                : undefined
            }
            className="w-64"
          />
        )}
      </div>
    </div>
  );
}
