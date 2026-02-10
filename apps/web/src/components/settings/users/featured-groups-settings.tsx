'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
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
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';

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
  const queryClient = useQueryClient();

  const { data: featuredConfig, isLoading: isLoadingConfig } =
    useWorkspaceConfig<string | null>(wsId, 'DATABASE_FEATURED_GROUPS', null);

  const { data: groupsData, isLoading: isLoadingGroups } =
    useWorkspaceUserGroups(wsId);

  const isLoading = isLoadingConfig || isLoadingGroups;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      featured_groups: [],
    },
    values: useMemo(() => {
      if (isLoading) return undefined;

      const parseIds = (raw: string | null | undefined): string[] =>
        (raw || '')
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);

      // Filter out stale/deleted group IDs
      const availableIds = new Set((groupsData || []).map((g) => g.id));
      return {
        featured_groups: parseIds(featuredConfig).filter((id) =>
          availableIds.has(id)
        ),
      };
    }, [isLoading, featuredConfig, groupsData]),
    resetOptions: {
      keepDirtyValues: true,
    },
  });

  const selectedGroupIds = form.watch('featured_groups') || [];

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

      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/DATABASE_FEATURED_GROUPS`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: serialized }),
        }
      );

      if (!res.ok) throw new Error('Failed to update DATABASE_FEATURED_GROUPS');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', wsId, 'DATABASE_FEATURED_GROUPS'],
      });
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
