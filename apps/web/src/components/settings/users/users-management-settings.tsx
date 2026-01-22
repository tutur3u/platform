'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
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
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useWorkspaceConfig } from '@/hooks/use-workspace-config';

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

  const { data: groupsData, isLoading: isLoadingGroups } = useQuery({
    queryKey: ['workspace-user-groups', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_user_groups')
        .select('id, name, archived')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) {
        console.error(
          'Error fetching workspace user groups for users management settings:',
          error
        );
        throw error;
      }

      return (data || []) as {
        id: string;
        name: string;
        archived: boolean | null;
      }[];
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
  });

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      default_excluded_groups: [],
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

  useEffect(() => {
    if (defaultExcludedConfig !== undefined) {
      const parseIds = (raw: string | null | undefined): string[] =>
        (raw || '')
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);

      form.reset({
        default_excluded_groups: parseIds(defaultExcludedConfig),
      });
    }
  }, [defaultExcludedConfig, form]);

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
        queryKey: ['workspace-config', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          wsId,
          'DATABASE_DEFAULT_EXCLUDED_GROUPS',
        ],
      });
      toast.success(t('update_success'));
      form.reset(form.getValues());
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  const isLoading = isLoadingConfig || isLoadingGroups;

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
    </div>
  );
}
