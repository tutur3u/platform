import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
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
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/settings/${configId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: values.default_title.trim() }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update settings');
      }

      return res.json();
    },
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
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium text-lg">{t('title')}</h3>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="default_title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('default_title_label')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={t('default_title_placeholder')}
                  />
                </FormControl>
                <FormDescription>{t('default_title_help')}</FormDescription>
                <FormMessage />
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
