'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createWalletCheckpointReconciliation,
  listTransactionCategories,
} from '@tuturuuu/internal-api/finance';
import { FINANCE_DEFAULT_RECONCILIATION_CATEGORY_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
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
import { useEffect, useMemo, useState } from 'react';

const NO_CATEGORY = 'none';

export function WalletCheckpointAdjustmentDialog({
  checkedAt,
  checkpointId,
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
  checkpointId: string;
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
    t('reconciliation_description', {
      date: new Date(checkedAt).toLocaleDateString(),
      wallet: walletName,
    })
  );
  const [categoryInitialized, setCategoryInitialized] = useState(false);
  const categoriesQuery = useQuery({
    queryKey: ['transaction-categories', wsId],
    queryFn: () => listTransactionCategories(wsId),
    enabled: open,
  });
  const {
    data: defaultReconciliationCategoryId,
    isLoading: isLoadingDefaultReconciliationCategory,
  } = useWorkspaceConfig<string>(
    wsId,
    FINANCE_DEFAULT_RECONCILIATION_CATEGORY_CONFIG_ID,
    ''
  );

  useEffect(() => {
    if (!open) {
      setCategoryId(NO_CATEGORY);
      setCategoryInitialized(false);
      return;
    }

    if (
      categoryInitialized ||
      categoriesQuery.isLoading ||
      isLoadingDefaultReconciliationCategory
    ) {
      return;
    }

    const defaultCategoryExists = (categoriesQuery.data ?? []).some(
      (category) => category.id === defaultReconciliationCategoryId
    );

    setCategoryId(
      defaultReconciliationCategoryId && defaultCategoryExists
        ? defaultReconciliationCategoryId
        : NO_CATEGORY
    );
    setCategoryInitialized(true);
  }, [
    categoriesQuery.data,
    categoriesQuery.isLoading,
    categoryInitialized,
    defaultReconciliationCategoryId,
    isLoadingDefaultReconciliationCategory,
    open,
  ]);
  const amountText = useMemo(
    () =>
      formatCurrency(variance, currency, undefined, {
        maximumFractionDigits: currency === 'VND' ? 0 : 6,
        signDisplay: 'always',
      }),
    [currency, variance]
  );
  const checkedAtText = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(checkedAt)),
    [checkedAt]
  );
  const mutation = useMutation({
    mutationFn: () =>
      createWalletCheckpointReconciliation(wsId, walletId, checkpointId, {
        category_id: categoryId === NO_CATEGORY ? undefined : categoryId,
        description,
      }),
    onSuccess: (result) => {
      toast.success(
        result.created ? t('reconciliation_created') : t('reconciliation_clean')
      );
      onCreated();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t('reconciliation_error')
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create_reconciliation_transaction')}</DialogTitle>
          <DialogDescription>
            {t('create_reconciliation_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>{t('offset_amount_preview')}</Label>
            <Input value={amountText} readOnly />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checkpoint-reconciliation-date">{t('date')}</Label>
            <Input
              id="checkpoint-reconciliation-date"
              value={checkedAtText}
              readOnly
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
            disabled={mutation.isPending || !categoryInitialized}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t('creating') : t('reconcile')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
