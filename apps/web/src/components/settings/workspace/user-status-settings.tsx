'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionFooter,
} from '@tuturuuu/ui/custom/settings-section';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useUserStatusLabels } from '@/hooks/use-user-status-labels';

interface Props {
  wsId: string;
}

const formSchema = z.object({
  archived: z.string().min(1),
  archived_until: z.string().min(1),
  permanently_archived: z.string().min(1),
});

export default function UserStatusSettings({ wsId }: Props) {
  const t = useTranslations('ws-user-status-settings');
  const labels = useUserStatusLabels(wsId);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: labels,
  });

  const updateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/user_status_labels`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: JSON.stringify(values) }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update settings');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', wsId, 'user_status_labels'],
      });
      toast.success(t('update_success'));
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateMutation.mutate(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <SettingsSection description={t('description')}>
          <FormField
            control={form.control}
            name="archived"
            render={({ field }) => (
              <FormItem>
                <SettingItemTab
                  controlClassName="space-y-2"
                  controlWidth="xl"
                  title={<FormLabel>{t('archived_label')}</FormLabel>}
                >
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </SettingItemTab>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="archived_until"
            render={({ field }) => (
              <FormItem>
                <SettingItemTab
                  controlClassName="space-y-2"
                  controlWidth="xl"
                  title={<FormLabel>{t('archived_until_label')}</FormLabel>}
                >
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </SettingItemTab>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="permanently_archived"
            render={({ field }) => (
              <FormItem>
                <SettingItemTab
                  controlClassName="space-y-2"
                  controlWidth="xl"
                  title={
                    <FormLabel>{t('permanently_archived_label')}</FormLabel>
                  }
                >
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </SettingItemTab>
              </FormItem>
            )}
          />

          <SettingsSectionFooter>
            <Button size="sm" type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('saving') : t('save')}
            </Button>
          </SettingsSectionFooter>
        </SettingsSection>
      </form>
    </Form>
  );
}
