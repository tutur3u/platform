'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import DefaultGroupSettings from './default-group-settings';
import { useHydratedWorkspaceGroupSelection } from './use-hydrated-workspace-group-selection';

interface Props {
  wsId: string;
  initialSelectedGroupIds?: string[];
  isConfigLoading?: boolean;
}

export default function UsersManagementSettings({
  wsId,
  initialSelectedGroupIds = [],
  isConfigLoading = false,
}: Props) {
  const t = useTranslations('settings.user_management');
  const queryClient = useQueryClient();
  const {
    selection,
    setSelection,
    isDirty,
    isInitializing,
    options,
    hasUnresolvedSelectedGroups,
    isLoadingOptions,
    setSearchQuery,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useHydratedWorkspaceGroupSelection({
    wsId,
    savedGroupIds: initialSelectedGroupIds,
    isConfigLoading,
  });

  const updateMutation = useMutation({
    mutationFn: async (selection: string[]) =>
      updateWorkspaceConfig(
        wsId,
        DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
        selection
          .map((value) => value.trim())
          .filter(Boolean)
          .join(',')
      ),
    onSuccess: (_data, selection) => {
      queryClient.setQueriesData(
        { queryKey: ['workspace-configs', wsId] },
        (existing: Record<string, string | null> | undefined) => ({
          ...(existing ?? {}),
          [DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID]: selection.join(','),
        })
      );
      queryClient.invalidateQueries({ queryKey: ['workspace-configs', wsId] });
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
          updateMutation.mutate(selection);
        }}
        className="space-y-4"
      >
        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <div className="font-medium text-base">
              {t('default_excluded_groups_label')}
            </div>
            <div className="text-muted-foreground text-sm">
              {t('default_excluded_groups_help')}
            </div>
          </div>
          {isLoadingOptions ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Combobox
              mode="multiple"
              options={options}
              selected={selection}
              onChange={(value) =>
                setSelection(
                  Array.isArray(value) ? value : value ? [value] : []
                )
              }
              placeholder={t('select_groups_placeholder')}
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
              label={
                selection.length > 2 || hasUnresolvedSelectedGroups
                  ? t('selected_groups_count', {
                      count: selection.length,
                    })
                  : undefined
              }
              className="w-64"
            />
          )}
        </div>

        <Button type="submit" disabled={updateMutation.isPending || !isDirty}>
          {updateMutation.isPending ? t('saving') : t('save')}
        </Button>
      </form>

      <DefaultGroupSettings wsId={wsId} />
    </div>
  );
}
