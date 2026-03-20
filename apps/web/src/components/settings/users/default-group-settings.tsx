'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { updateWorkspaceConfig } from '@tuturuuu/internal-api/workspace-configs';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useInfiniteWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';

interface Props {
  wsId: string;
}

export default function DefaultGroupSettings({ wsId }: Props) {
  const t = useTranslations('settings.user_management');
  const commonT = useTranslations('common');
  const queryClient = useQueryClient();

  const { data: defaultGroupConfig, isLoading: isLoadingConfig } =
    useWorkspaceConfig<string | null>(
      wsId,
      'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
      null
    );
  const [searchQuery, setSearchQuery] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [initialValue, setInitialValue] = useState<string | null>(null);
  const [currentValue, setCurrentValue] = useState<string | null>(null);

  const {
    data: groupsData,
    isLoading: isLoadingGroups,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteWorkspaceUserGroups(wsId, {
    query: searchQuery,
    ensureGroupIds: [
      ...new Set(
        [defaultGroupConfig, currentValue].filter((value): value is string =>
          Boolean(value)
        )
      ),
    ],
  });

  const isLoading = isLoadingConfig || isLoadingGroups;

  const groupOptions: ComboboxOption[] = useMemo(
    () =>
      (groupsData || []).map((group) => ({
        value: group.id,
        label: group.name + (group.archived ? ' (Archived)' : ''),
      })),
    [groupsData]
  );

  useEffect(() => {
    if (isLoading) return;

    // Validate stored ID against available groups (stale ID cleanup)
    const availableIds = new Set((groupsData || []).map((g) => g.id));
    const cleanedValue =
      defaultGroupConfig && availableIds.has(defaultGroupConfig)
        ? defaultGroupConfig
        : null;

    setInitialValue(cleanedValue);
    if (!initialized) {
      setCurrentValue(cleanedValue);
      setInitialized(true);
    }
  }, [isLoading, defaultGroupConfig, groupsData, initialized]);

  const updateMutation = useMutation({
    mutationFn: async (value: string | null) =>
      updateWorkspaceConfig(
        wsId,
        'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
        value ?? ''
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          wsId,
          'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
        ],
      });
      toast.success(t('update_success'));
      setInitialValue(currentValue);
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

  const isDirty = currentValue !== initialValue;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        updateMutation.mutate(currentValue);
      }}
      className="space-y-4"
    >
      <div className="flex flex-row items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <div className="font-medium text-base">
            {t('default_group_label')}
          </div>
          <div className="text-muted-foreground text-sm">
            {t('default_group_help')}
          </div>
        </div>
        <Combobox
          options={groupOptions}
          selected={currentValue ?? ''}
          onChange={(value) => setCurrentValue((value as string) || null)}
          placeholder={t('default_group_placeholder')}
          searchPlaceholder={t('search_groups')}
          emptyText={t('no_groups_found')}
          onSearchChange={setSearchQuery}
          hasMore={Boolean(hasNextPage)}
          onLoadMore={() => {
            if (!isFetchingNextPage) {
              void fetchNextPage();
            }
          }}
          loadingMore={isFetchingNextPage}
          loadMoreText={commonT('load_more')}
          loadingMoreText={commonT('loading')}
          actions={[
            {
              key: 'clear-default-group',
              label: t('no_default_group'),
              onSelect: () => setCurrentValue(null),
            },
          ]}
          className="w-64"
        />
      </div>

      <Button
        type="submit"
        disabled={isLoading || updateMutation.isPending || !isDirty}
      >
        {updateMutation.isPending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
