'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  getWorkspaceConfigIdList,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@tuturuuu/ui/form';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useInfiniteWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';

const MAX_FEATURED_GROUPS = 3;

interface Props {
  wsId: string;
}

const formSchema = z.object({
  featured_groups: z.array(z.string()).max(MAX_FEATURED_GROUPS).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function FeaturedGroupsSettings({ wsId }: Props) {
  const t = useTranslations('settings.user_management');
  const commonT = useTranslations('common');
  const queryClient = useQueryClient();

  const { data: featuredGroupIds = [], isLoading: isLoadingConfig } = useQuery({
    queryKey: ['workspace-featured-groups', wsId],
    queryFn: () =>
      getWorkspaceConfigIdList(wsId, DATABASE_FEATURED_GROUPS_CONFIG_ID),
    staleTime: 10 * 60 * 1000,
  });
  const [searchQuery, setSearchQuery] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      featured_groups: [],
    },
    values: useMemo(() => {
      if (isLoadingConfig) return undefined;

      return {
        featured_groups: featuredGroupIds,
      };
    }, [featuredGroupIds, isLoadingConfig]),
    resetOptions: {
      keepDirtyValues: true,
    },
  });

  const selectedGroupIds = form.watch('featured_groups') || [];

  const {
    data: groupsData,
    isLoading: isLoadingGroups,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteWorkspaceUserGroups(wsId, {
    query: searchQuery,
    ensureGroupIds: [...new Set([...featuredGroupIds, ...selectedGroupIds])],
  });

  const isLoading = isLoadingConfig || isLoadingGroups;

  useEffect(() => {
    if (isLoading || !groupsData) return;

    const availableIds = new Set(groupsData.map((group) => group.id));
    const currentSelection = form.getValues('featured_groups') || [];
    const filteredSelection = currentSelection.filter((id) =>
      availableIds.has(id)
    );

    if (filteredSelection.length !== currentSelection.length) {
      form.setValue('featured_groups', filteredSelection, {
        shouldDirty: false,
      });
    }
  }, [form, groupsData, isLoading]);

  const groupOptions: ComboboxOption[] = useMemo(() => {
    const selectedSet = new Set(selectedGroupIds);
    return (groupsData || [])
      .map((group) => ({
        value: group.id,
        label: group.name + (group.archived ? ' (Archived)' : ''),
      }))
      .sort((a, b) => {
        const aSelected = selectedSet.has(a.value);
        const bSelected = selectedSet.has(b.value);
        if (aSelected === bSelected) return 0;
        return aSelected ? -1 : 1;
      });
  }, [groupsData, selectedGroupIds]);

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const serialized = (values.featured_groups || [])
        .map((v) => v.trim())
        .filter(Boolean)
        .join(',');

      return updateWorkspaceConfig(
        wsId,
        DATABASE_FEATURED_GROUPS_CONFIG_ID,
        serialized
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-featured-groups', wsId],
      });
      toast.success(t('update_success'));
      form.reset(form.getValues());
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  const handleChange = (newValue: string | string[]) => {
    const values = Array.isArray(newValue) ? newValue : [newValue];
    if (values.length > MAX_FEATURED_GROUPS) {
      toast.warning(t('max_featured_groups_reached'));
      return;
    }
    form.setValue('featured_groups', values, { shouldDirty: true });
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="featured_groups"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('featured_groups_label')}
                  </FormLabel>
                  <FormDescription>{t('featured_groups_help')}</FormDescription>
                </div>
                <FormControl>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Combobox
                      mode="multiple"
                      options={groupOptions}
                      selected={field.value ?? []}
                      onChange={handleChange}
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
