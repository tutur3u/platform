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
import DefaultGroupSettings from './default-group-settings';

interface Props {
  wsId: string;
}

const formSchema = z.object({
  default_excluded_groups: z.array(z.string()).optional(),
});

export default function UsersManagementSettings({ wsId }: Props) {
  const t = useTranslations('settings.user_management');
  const queryClient = useQueryClient();

  const { data: defaultExcludedConfig, isLoading: isLoadingConfig } =
    useWorkspaceConfig<string | null>(
      wsId,
      'DATABASE_DEFAULT_EXCLUDED_GROUPS',
      null
    );

  const { data: groupsData, isLoading: isLoadingGroups } =
    useWorkspaceUserGroups(wsId);

  const isLoading = isLoadingConfig || isLoadingGroups;

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      default_excluded_groups: [],
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
        default_excluded_groups: parseIds(defaultExcludedConfig).filter((id) =>
          availableIds.has(id)
        ),
      };
    }, [isLoading, defaultExcludedConfig, groupsData]),
    resetOptions: {
      keepDirtyValues: true,
    },
  });

  const selectedGroupIds = form.watch('default_excluded_groups') || [];

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
      const serializeIds = (ids: string[] | undefined) =>
        ids
          ? ids
              .map((v) => v.trim())
              .filter(Boolean)
              .join(',')
          : '';

      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/DATABASE_DEFAULT_EXCLUDED_GROUPS`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value: serializeIds(values.default_excluded_groups),
          }),
        }
      );

      if (!res.ok)
        throw new Error('Failed to update DATABASE_DEFAULT_EXCLUDED_GROUPS');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          wsId,
          'DATABASE_DEFAULT_EXCLUDED_GROUPS',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspace-default-excluded-groups', wsId],
      });
      toast.success(t('update_success'));
      form.reset(form.getValues());
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="default_excluded_groups"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('default_excluded_groups_label')}
                  </FormLabel>
                  <FormDescription>
                    {t('default_excluded_groups_help')}
                  </FormDescription>
                </div>
                <FormControl>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Combobox
                      mode="multiple"
                      options={groupOptions}
                      selected={field.value ?? []}
                      onChange={field.onChange}
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

      <DefaultGroupSettings wsId={wsId} />
    </div>
  );
}
