'use client';

import {
  Banknote,
  CreditCard,
  ShieldCheck,
  TriangleAlert,
} from '@tuturuuu/icons';
import type { InventoryStaffCheckoutOptions } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

export function CashCheckoutFields({
  categoryId,
  checkoutMethod,
  error,
  onCategoryChange,
  onCheckoutMethodChange,
  onWalletChange,
  options,
  walletId,
}: {
  categoryId: string;
  checkoutMethod: 'cash' | 'configured';
  error?: string | null;
  onCategoryChange: (value: string) => void;
  onCheckoutMethodChange: (value: 'cash' | 'configured') => void;
  onWalletChange: (value: string) => void;
  options?: InventoryStaffCheckoutOptions;
  walletId: string;
}) {
  const t = useTranslations('storefront');
  const methods = options?.paymentMethods ?? [];
  const cash = options?.cash;

  if (error && methods.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dynamic-red/25 bg-dynamic-red/5 p-4">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-dynamic-red" />
        <div className="space-y-1">
          <p className="font-medium text-sm">{t('cashStaffRequiredTitle')}</p>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!cash || !methods.includes('cash')) return null;

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/35">
          <Banknote className="size-4" />
        </span>
        <div className="space-y-1">
          <p className="font-medium text-sm">{t('paymentMethod')}</p>
          <p className="text-muted-foreground text-sm">
            {t('cashPaymentDescription')}
          </p>
        </div>
      </div>

      {methods.includes('configured') ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => onCheckoutMethodChange('configured')}
            type="button"
            variant={checkoutMethod === 'configured' ? 'default' : 'outline'}
          >
            <CreditCard className="size-4" />
            {t('configuredPayment')}
          </Button>
          <Button
            onClick={() => onCheckoutMethodChange('cash')}
            type="button"
            variant={checkoutMethod === 'cash' ? 'default' : 'outline'}
          >
            <Banknote className="size-4" />
            {t('cash')}
          </Button>
        </div>
      ) : null}

      {checkoutMethod === 'cash' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{t('cashWallet')}</span>
            <Select onValueChange={onWalletChange} value={walletId}>
              <SelectTrigger>
                <SelectValue placeholder={t('cashChooseWallet')} />
              </SelectTrigger>
              <SelectContent>
                {cash.wallets.map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.id}>
                    {wallet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{t('cashCategory')}</span>
            <Select onValueChange={onCategoryChange} value={categoryId}>
              <SelectTrigger>
                <SelectValue placeholder={t('cashChooseCategory')} />
              </SelectTrigger>
              <SelectContent>
                {cash.categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <p className="flex items-center gap-2 text-muted-foreground text-xs sm:col-span-2">
            <ShieldCheck className="size-3.5 text-dynamic-green" />
            {t('cashStaffProtection')}
          </p>
        </div>
      ) : null}
    </div>
  );
}
