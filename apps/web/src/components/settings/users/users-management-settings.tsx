'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import DefaultGroupSettings from './default-group-settings';
import { useHydratedWorkspaceGroupSelection } from './use-hydrated-workspace-group-selection';

interface Props {
  wsId: string;
  initialIncludedGroupIds?: string[];
  initialSelectedGroupIds?: string[];
  initialAutoAddNewGroupsToDefaultIncludedGroups?: boolean;
  isConfigLoading?: boolean;
}

export default function UsersManagementSettings({
  wsId,
  initialIncludedGroupIds = [],
  initialSelectedGroupIds = [],
  initialAutoAddNewGroupsToDefaultIncludedGroups = false,
  isConfigLoading = false,
}: Props) {
  const t = useTranslations('settings.user_management');
  const commonT = useTranslations('common');
  const queryClient = useQueryClient();
  const includedSelectionState = useHydratedWorkspaceGroupSelection({
    wsId,
    savedGroupIds: initialIncludedGroupIds,
    isConfigLoading,
  });
  const {
    selection: excludedSelection,
    setSelection: setExcludedSelection,
    isDirty: isExcludedSelectionDirty,
    isInitializing,
    options: excludedOptions,
    hasUnresolvedSelectedGroups: hasUnresolvedExcludedGroups,
    isLoadingOptions: isLoadingExcludedOptions,
    setSearchQuery: setExcludedSearchQuery,
    hasNextPage: hasNextExcludedPage,
    fetchNextPage: fetchNextExcludedPage,
    isFetchingNextPage: isFetchingNextExcludedPage,
  } = useHydratedWorkspaceGroupSelection({
    wsId,
    savedGroupIds: initialSelectedGroupIds,
    isConfigLoading,
  });
  const [initialAutoAddNewGroups, setInitialAutoAddNewGroups] = useState(
    initialAutoAddNewGroupsToDefaultIncludedGroups
  );
  const [autoAddNewGroupsToDefaultIncludedGroups, setAutoAddNewGroups] =
    useState(initialAutoAddNewGroupsToDefaultIncludedGroups);
  const [hasEditedAutoAddNewGroups, setHasEditedAutoAddNewGroups] =
    useState(false);

  useEffect(() => {
    if (isConfigLoading) {
      return;
    }

    setInitialAutoAddNewGroups(initialAutoAddNewGroupsToDefaultIncludedGroups);

    if (!hasEditedAutoAddNewGroups) {
      setAutoAddNewGroups(initialAutoAddNewGroupsToDefaultIncludedGroups);
    }
  }, [
    hasEditedAutoAddNewGroups,
    initialAutoAddNewGroupsToDefaultIncludedGroups,
    isConfigLoading,
  ]);

  const isAutoAddDirty =
    autoAddNewGroupsToDefaultIncludedGroups !== initialAutoAddNewGroups;
  const isDirty =
    includedSelectionState.isDirty ||
    isExcludedSelectionDirty ||
    isAutoAddDirty;

  const updateMutation = useMutation({
    mutationFn: async ({
      includedGroupIds,
      excludedGroupIds,
      autoAddNewGroups,
    }: {
      includedGroupIds: string[];
      excludedGroupIds: string[];
      autoAddNewGroups: boolean;
    }) =>
      Promise.all([
        updateWorkspaceConfig(
          wsId,
          DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
          includedGroupIds.join(',')
        ),
        updateWorkspaceConfig(
          wsId,
          DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
          excludedGroupIds.join(',')
        ),
        updateWorkspaceConfig(
          wsId,
          DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
          String(autoAddNewGroups)
        ),
      ]),
    onSuccess: (
      _data,
      { includedGroupIds, excludedGroupIds, autoAddNewGroups }
    ) => {
      queryClient.setQueriesData(
        { queryKey: ['workspace-configs', wsId] },
        (existing: Record<string, string | null> | undefined) => ({
          ...(existing ?? {}),
          [DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID]:
            includedGroupIds.join(','),
          [DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID]:
            excludedGroupIds.join(','),
          [DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID]:
            String(autoAddNewGroups),
        })
      );
      queryClient.setQueryData(
        ['workspace-default-included-groups', wsId],
        includedGroupIds
      );
      queryClient.setQueryData(
        ['workspace-default-excluded-groups', wsId],
        excludedGroupIds
      );
      queryClient.setQueryData(
        [
          'workspace-config',
          wsId,
          DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
        ],
        String(autoAddNewGroups)
      );
      queryClient.invalidateQueries({ queryKey: ['workspace-configs', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['workspace-default-included-groups', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspace-default-excluded-groups', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          wsId,
          DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
        ],
      });
      setInitialAutoAddNewGroups(autoAddNewGroups);
      setHasEditedAutoAddNewGroups(false);
      toast.success(t('update_success'));
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  if (isInitializing) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          updateMutation.mutate({
            includedGroupIds: includedSelectionState.selection,
            excludedGroupIds: excludedSelection,
            autoAddNewGroups: autoAddNewGroupsToDefaultIncludedGroups,
          });
        }}
        className="space-y-4"
      >
        <GroupSelectionSettingCard
          label={t('default_included_groups_label')}
          help={t('default_included_groups_help')}
          selection={includedSelectionState.selection}
          setSelection={includedSelectionState.setSelection}
          options={includedSelectionState.options}
          hasUnresolvedSelectedGroups={
            includedSelectionState.hasUnresolvedSelectedGroups
          }
          isLoadingOptions={includedSelectionState.isLoadingOptions}
          setSearchQuery={includedSelectionState.setSearchQuery}
          hasNextPage={includedSelectionState.hasNextPage}
          fetchNextPage={includedSelectionState.fetchNextPage}
          isFetchingNextPage={includedSelectionState.isFetchingNextPage}
          placeholder={t('select_groups_placeholder')}
          searchPlaceholder={t('search_groups')}
          emptyText={t('no_groups_found')}
          selectedGroupsCountLabel={t('selected_groups_count', {
            count: includedSelectionState.selection.length,
          })}
          loadMoreText={commonT('load_more')}
          loadingMoreText={commonT('loading')}
        />

        <GroupSelectionSettingCard
          label={t('default_excluded_groups_label')}
          help={t('default_excluded_groups_help')}
          selection={excludedSelection}
          setSelection={setExcludedSelection}
          options={excludedOptions}
          hasUnresolvedSelectedGroups={hasUnresolvedExcludedGroups}
          isLoadingOptions={isLoadingExcludedOptions}
          setSearchQuery={setExcludedSearchQuery}
          hasNextPage={hasNextExcludedPage}
          fetchNextPage={fetchNextExcludedPage}
          isFetchingNextPage={isFetchingNextExcludedPage}
          placeholder={t('select_groups_placeholder')}
          searchPlaceholder={t('search_groups')}
          emptyText={t('no_groups_found')}
          selectedGroupsCountLabel={t('selected_groups_count', {
            count: excludedSelection.length,
          })}
          loadMoreText={commonT('load_more')}
          loadingMoreText={commonT('loading')}
        />

        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <div className="font-medium text-base">
              {t('auto_add_new_groups_to_default_included_groups_label')}
            </div>
            <div className="text-muted-foreground text-sm">
              {t('auto_add_new_groups_to_default_included_groups_help')}
            </div>
          </div>
          <Switch
            checked={autoAddNewGroupsToDefaultIncludedGroups}
            onCheckedChange={(checked) => {
              setHasEditedAutoAddNewGroups(true);
              setAutoAddNewGroups(checked);
            }}
            disabled={updateMutation.isPending}
          />
        </div>

        <Button type="submit" disabled={updateMutation.isPending || !isDirty}>
          {updateMutation.isPending ? t('saving') : t('save')}
        </Button>
      </form>

      <DefaultGroupSettings wsId={wsId} />
    </div>
  );
}

interface GroupSelectionSettingCardProps {
  label: string;
  help: string;
  selection: string[];
  setSelection: (selection: string[]) => void;
  options: ComboboxOption[];
  hasUnresolvedSelectedGroups: boolean;
  isLoadingOptions: boolean;
  setSearchQuery: (query: string) => void;
  hasNextPage: boolean | undefined;
  fetchNextPage: () => Promise<unknown>;
  isFetchingNextPage: boolean;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  selectedGroupsCountLabel: string;
  loadMoreText: string;
  loadingMoreText: string;
}

function GroupSelectionSettingCard({
  label,
  help,
  selection,
  setSelection,
  options,
  hasUnresolvedSelectedGroups,
  isLoadingOptions,
  setSearchQuery,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  placeholder,
  searchPlaceholder,
  emptyText,
  selectedGroupsCountLabel,
  loadMoreText,
  loadingMoreText,
}: GroupSelectionSettingCardProps) {
  return (
    <div className="flex flex-row items-center justify-between rounded-lg border p-4">
      <div className="space-y-0.5">
        <div className="font-medium text-base">{label}</div>
        <div className="text-muted-foreground text-sm">{help}</div>
      </div>
      {isLoadingOptions ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Combobox
          mode="multiple"
          options={options}
          selected={selection}
          onChange={(value) =>
            setSelection(Array.isArray(value) ? value : value ? [value] : [])
          }
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          emptyText={emptyText}
          onSearchChange={setSearchQuery}
          hasMore={Boolean(hasNextPage)}
          onLoadMore={() => {
            if (!isFetchingNextPage) {
              void fetchNextPage();
            }
          }}
          loadingMore={isFetchingNextPage}
          loadMoreText={loadMoreText}
          loadingMoreText={loadingMoreText}
          label={
            selection.length > 2 || hasUnresolvedSelectedGroups
              ? selectedGroupsCountLabel
              : undefined
          }
          className="w-64"
        />
      )}
    </div>
  );
}
