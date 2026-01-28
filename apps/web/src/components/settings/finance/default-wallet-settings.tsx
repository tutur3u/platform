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
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useWallets } from '@/hooks/use-wallets';

interface Props {
  workspaceId: string;
}

const formSchema = z.object({
  default_wallet_id: z.string().optional(),
});

const NONE_OPTION = 'none';

export default function DefaultWalletSettings({ workspaceId }: Props) {
  const t = useTranslations('ws-finance-settings');
  const tWallets = useTranslations('ws-wallets');
  const { data: wallets = [], isLoading: isLoadingWallets } =
    useWallets(workspaceId);
  const { data: defaultConfig, isLoading: isLoadingDefaultConfig } =
    useWorkspaceConfig(workspaceId, 'default_wallet_id', '');

  const queryClient = useQueryClient();

  const isLoading = isLoadingWallets || isLoadingDefaultConfig;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      default_wallet_id: NONE_OPTION,
    },
    values: useMemo(() => {
      if (isLoading) return undefined;
      return {
        default_wallet_id: (defaultConfig as string) || NONE_OPTION,
      };
    }, [isLoading, defaultConfig]),
    resetOptions: {
      keepDirtyValues: true,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const nextValue =
        values.default_wallet_id && values.default_wallet_id !== NONE_OPTION
          ? values.default_wallet_id
          : '';
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/settings/default_wallet_id`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: nextValue }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update settings');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', workspaceId, 'default_wallet_id'],
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
                  value={field.value ?? NONE_OPTION}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('select_default_wallet')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE_OPTION}>
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
