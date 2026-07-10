'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useHydratedWorkspaceGroupSelection } from './use-hydrated-workspace-group-selection';

const MAX_FEATURED_GROUPS = 3;

interface Props {
  wsId: string;
  initialSelectedGroupIds?: string[];
  isConfigLoading?: boolean;
}

export default function FeaturedGroupsSettings({
  wsId,
  initialSelectedGroupIds = [],
  isConfigLoading = false,
}: Props) {
  const t = useTranslations('settings.user_management');
  const commonT = useTranslations('common');
  const queryClient = useQueryClient();
  const {
    selection,
    setSelection,
    isDirty,
    isInitializing,
    options,
    hasUnresolvedSelectedGroups,
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
    mutationFn: async (selectedGroupIds: string[]) =>
      updateWorkspaceConfig(
        wsId,
        DATABASE_FEATURED_GROUPS_CONFIG_ID,
        selectedGroupIds.join(',')
      ),
    onSuccess: (_data, selectedGroupIds) => {
      queryClient.setQueriesData(
        { queryKey: ['workspace-configs', wsId] },
        (existing: Record<string, string | null> | undefined) => ({
          ...(existing ?? {}),
          [DATABASE_FEATURED_GROUPS_CONFIG_ID]: selectedGroupIds.join(','),
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
              {t('featured_groups_label')}
            </div>
            <div className="text-muted-foreground text-sm">
              {t('featured_groups_help')}
            </div>
          </div>

          <Combobox
            mode="multiple"
            options={options}
            selected={selection}
            onChange={(value) => {
              const nextSelection = Array.isArray(value)
                ? value
                : value
                  ? [value]
                  : [];

              if (nextSelection.length > MAX_FEATURED_GROUPS) {
                toast.warning(t('max_featured_groups_reached'));
                return;
              }

              setSelection(nextSelection);
            }}
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
            loadMoreText={commonT('load_more')}
            loadingMoreText={commonT('loading')}
            label={
              selection.length > 2 || hasUnresolvedSelectedGroups
                ? t('selected_groups_count', {
                    count: selection.length,
                  })
                : undefined
            }
            className="w-64"
          />
        </div>

        <Button type="submit" disabled={updateMutation.isPending || !isDirty}>
          {updateMutation.isPending ? t('saving') : t('save')}
        </Button>
      </form>
    </div>
  );
}
