'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import type { WalletFormValues } from '@tuturuuu/ui/finance/wallets/wallet-form-schema';
import {
  viewingWindowOptions,
  walletFormSchema,
} from '@tuturuuu/ui/finance/wallets/wallet-form-schema';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm, useWatch } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface AddWalletDialogProps {
  wsId: string;
  roleId: string;
  availableWallets: Array<{
    id: string;
    name: string | null;
    balance?: number | null;
    currency?: string;
    type?: string;
  }>;
}

export function AddWalletDialog({
  wsId,
  roleId,
  availableWallets,
}: AddWalletDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const form = useForm<WalletFormValues>({
    resolver: zodResolver(walletFormSchema),
    defaultValues: {
      wallet_id: '',
      viewing_window: '1_month',
      custom_days: undefined,
    },
  });

  const viewingWindow = useWatch({
    control: form.control,
    name: 'viewing_window',
    defaultValue: '1_month',
  });

  const addWalletMutation = useMutation({
    mutationFn: async (data: WalletFormValues) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/roles/${roleId}/wallets`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to add wallet');
      }

      return res.json();
    },
    onSuccess: () => {
      toast.success(t('ws-roles.wallet_added_successfully'));
      queryClient.invalidateQueries({
        queryKey: ['workspaces', wsId, 'roles', roleId, 'wallets'],
      });
      form.reset();
      setOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || t('ws-roles.failed_to_add_wallet'));
    },
  });

  const onSubmit = (data: WalletFormValues) => {
    addWalletMutation.mutate(data);
  };

  // Handle dialog close to reset form
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      form.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={availableWallets.length === 0}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="text-xs sm:text-sm">{t('ws-roles.add_wallet')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ws-roles.add_wallet_to_role')}</DialogTitle>
          <DialogDescription>
            {t('ws-roles.add_wallet_to_role_description')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="wallet_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('ws-roles.wallet')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t('ws-roles.select_wallet')}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableWallets.map((wallet) => (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          {wallet.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="viewing_window"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('ws-roles.viewing_window')}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (value !== 'custom') {
                        form.setValue('custom_days', undefined);
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {viewingWindowOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(option.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t('ws-roles.viewing_window_description')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {viewingWindow === 'custom' && (
              <FormField
                control={form.control}
                name="custom_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('ws-roles.custom_days')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="30"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value
                              ? parseInt(e.target.value, 10)
                              : undefined
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      {t('ws-roles.custom_days_description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={addWalletMutation.isPending}>
                {addWalletMutation.isPending
                  ? t('common.processing')
                  : t('common.add')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
