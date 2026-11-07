import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateWorkspaceConfig } from '@tuturuuu/internal-api/workspace-configs';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionFooter,
} from '@tuturuuu/ui/custom/settings-section';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  workspaceId: string;
}

const formSchema = z.object({
  default_title: z.string(),
});

export function ReportDefaultTitleSettings({ workspaceId }: Props) {
  const t = useTranslations('ws-reports-settings');
  const configId = 'REPORT_DEFAULT_TITLE';

  const { data: configValue, isLoading } = useWorkspaceConfig<string>(
    workspaceId,
    configId,
    ''
  );

  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      default_title: '',
    },
    values: useMemo(() => {
      if (isLoading || configValue === undefined) return undefined;
      return {
        default_title: configValue ?? '',
      };
    }, [isLoading, configValue]),
    resetOptions: {
      keepDirtyValues: true,
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: z.infer<typeof formSchema>) =>
      updateWorkspaceConfig(workspaceId, configId, values.default_title.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', workspaceId, configId],
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
    <SettingsSection description={t('description')}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="default_title"
            render={({ field }) => (
              <FormItem className="gap-0">
                <SettingItemTab
                  title={<FormLabel>{t('default_title_label')}</FormLabel>}
                  description={
                    <FormDescription>{t('default_title_help')}</FormDescription>
                  }
                  controlWidth="xl"
                >
                  <div className="space-y-2">
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('default_title_placeholder')}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                </SettingItemTab>
              </FormItem>
            )}
          />

          <SettingsSectionFooter>
            <Button
              type="submit"
              disabled={
                isLoading || updateMutation.isPending || !form.formState.isDirty
              }
            >
              {updateMutation.isPending ? t('saving') : t('save')}
            </Button>
          </SettingsSectionFooter>
        </form>
      </Form>
    </SettingsSection>
  );
}
