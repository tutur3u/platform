'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@tuturuuu/ui/form';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useWorkspaceConfig } from '@/hooks/use-workspace-config';

interface Props {
  wsId: string;
}

const formSchema = z.object({
  use_attendance_based: z.boolean(),
});

export default function InvoiceAttendanceSettings({ wsId }: Props) {
  const t = useTranslations('ws-finance-settings');
  const { data: configValue, isLoading } = useWorkspaceConfig<string>(
    wsId,
    'INVOICE_USE_ATTENDANCE_BASED_CALCULATION',
    'true'
  );

  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      use_attendance_based: true,
    },
  });

  useEffect(() => {
    if (configValue !== undefined) {
      // `workspace_configs.value` is stored as text.
      const value = configValue.trim().toLowerCase() === 'true';
      form.reset({
        use_attendance_based: value,
      });
    }
  }, [configValue, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/INVOICE_USE_ATTENDANCE_BASED_CALCULATION`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value: values.use_attendance_based.toString(),
          }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update settings');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          wsId,
          'INVOICE_USE_ATTENDANCE_BASED_CALCULATION',
        ],
      });
      queryClient.invalidateQueries({
        queryKey: ['invoice-attendance-config', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['pending-invoices', wsId],
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
        <h3 className="font-medium text-lg">{t('invoice_attendance_title')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('invoice_attendance_description')}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="use_attendance_based"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    {t('invoice_attendance_label')}
                  </FormLabel>
                  <FormDescription>
                    {t('invoice_attendance_help')}
                  </FormDescription>
                </div>
                <FormControl>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
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
