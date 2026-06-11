'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createTransaction,
  listTransactionCategories,
} from '@tuturuuu/internal-api/finance';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { formatCurrency } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

const NO_CATEGORY = 'none';

export function WalletCheckpointAdjustmentDialog({
  checkedAt,
  currency,
  onCreated,
  onOpenChange,
  open,
  variance,
  walletId,
  walletName,
  wsId,
}: {
  checkedAt: string;
  currency: string;
  onCreated: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  variance: number;
  walletId: string;
  walletName: string;
  wsId: string;
}) {
  const t = useTranslations('wallet-checkpoints');
  const [categoryId, setCategoryId] = useState(NO_CATEGORY);
  const [description, setDescription] = useState(
    t('adjustment_description', {
      date: new Date(checkedAt).toLocaleDateString(),
      wallet: walletName,
    })
  );
  const [takenAt, setTakenAt] = useState(() => {
    const date = new Date(checkedAt);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  });
  const categoriesQuery = useQuery({
    queryKey: ['transaction-categories', wsId],
    queryFn: () => listTransactionCategories(wsId),
    enabled: open,
  });
  const amountText = useMemo(
    () =>
      formatCurrency(variance, currency, undefined, {
        maximumFractionDigits: currency === 'VND' ? 0 : 6,
        signDisplay: 'always',
      }),
    [currency, variance]
  );
  const mutation = useMutation({
    mutationFn: () =>
      createTransaction(wsId, {
        amount: variance,
        category_id: categoryId === NO_CATEGORY ? undefined : categoryId,
        description,
        origin_wallet_id: walletId,
        report_opt_in: false,
        taken_at: new Date(takenAt).toISOString(),
      }),
    onSuccess: () => {
      toast.success(t('adjustment_created'));
      onCreated();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t('adjustment_create_error')
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create_adjustment')}</DialogTitle>
          <DialogDescription>
            {t('create_adjustment_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>{t('adjustment_amount')}</Label>
            <Input value={amountText} readOnly />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checkpoint-adjustment-date">{t('date')}</Label>
            <Input
              id="checkpoint-adjustment-date"
              type="datetime-local"
              value={takenAt}
              onChange={(event) => setTakenAt(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t('category')}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>{t('no_category')}</SelectItem>
                {(categoriesQuery.data ?? [])
                  .filter(
                    (category): category is typeof category & { id: string } =>
                      typeof category.id === 'string'
                  )
                  .map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checkpoint-adjustment-description">
              {t('description')}
            </Label>
            <Textarea
              id="checkpoint-adjustment-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            disabled={mutation.isPending || variance === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t('creating') : t('create_adjustment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
