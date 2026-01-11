'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useWallets } from '@/hooks/use-wallets';
import { useWorkspaceConfig } from '@/hooks/use-workspace-config';

interface Props {
  wsId: string;
}

const formSchema = z.object({
  default_wallet_id: z.string().optional(),
});

export default function DefaultWalletSettings({ wsId }: Props) {
  const t = useTranslations('ws-finance-settings');
  const tWallets = useTranslations('ws-wallets');
  const { data: wallets = [] } = useWallets(wsId);
  const { data: defaultConfig } = useWorkspaceConfig(
    wsId,
    'default_wallet_id',
    ''
  );

  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      default_wallet_id: undefined,
    },
  });

  useEffect(() => {
    if (defaultConfig !== undefined) {
      form.reset({
        default_wallet_id: (defaultConfig as string) || undefined,
      });
    }
  }, [defaultConfig, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/default_wallet_id`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: values.default_wallet_id }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update settings');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', wsId, 'default_wallet_id'],
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
            name="default_wallet_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('default_wallet_label')}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('select_default_wallet')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">
                      {t('no_default_wallet')}
                    </SelectItem>
                    {wallets
                      .filter((wallet) => wallet.id)
                      .map((wallet) => (
                        <SelectItem key={wallet.id} value={wallet.id as string}>
                          {wallet.name || tWallets('unnamed_wallet')}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            disabled={updateMutation.isPending || !form.formState.isDirty}
          >
            {updateMutation.isPending ? t('saving') : t('save')}
          </Button>
        </form>
      </Form>
    </div>
  );
}
