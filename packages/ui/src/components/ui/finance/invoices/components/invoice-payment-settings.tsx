'use client';

import { CreditCard } from '@tuturuuu/icons';
import {
  Combobox,
  type ComboboxAction,
  type ComboboxOption,
} from '@tuturuuu/ui/custom/combobox';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { formatCurrency } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { AvailablePromotion } from '../hooks';

interface InvoicePaymentSettingsProps {
  wallets: Array<{
    id?: string | null;
    name?: string | null;
    type?: string | null;
    currency?: string | null;
  }>;
  categories: Array<{ id?: string | null; name?: string | null }>;
  selectedWalletId: string;
  selectedCategoryId: string;
  onWalletChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  showPromotion?: boolean;
  promotionsAllowed?: boolean;
  selectedUserId?: string;
  selectedPromotionId?: string;
  availablePromotions?: AvailablePromotion[];
  linkedPromotions?: Array<{
    promo_id?: string | null;
    workspace_promotions?: { name?: string | null } | null;
  }>;
  referralDiscountMap?: Map<string, number>;
  onPromotionChange?: (value: string) => void;
  promotionActions?: ReactNode;
  promotionActionsList?: ComboboxAction[];
  promotionActionsPosition?: 'top' | 'bottom';
  promotionPlaceholder?: string;
  walletLabelClassName?: string;
  categoryLabelClassName?: string;
  currency?: string;
}

export function InvoicePaymentSettings({
  wallets,
  categories,
  selectedWalletId,
  selectedCategoryId,
  onWalletChange,
  onCategoryChange,
  showPromotion = false,
  promotionsAllowed = true,
  selectedUserId,
  selectedPromotionId,
  availablePromotions = [],
  linkedPromotions = [],
  referralDiscountMap,
  onPromotionChange,
  promotionActions,
  promotionActionsList,
  promotionActionsPosition = 'top',
  promotionPlaceholder,
  walletLabelClassName = 'text-dynamic-red',
  categoryLabelClassName = 'text-dynamic-red',
  currency = 'USD',
}: InvoicePaymentSettingsProps) {
  const t = useTranslations();
  const shouldShowPromotion = showPromotion && promotionsAllowed;

  const promotionOptions = (() => {
    if (!shouldShowPromotion) return [];

    const list: ComboboxOption[] = [
      { value: 'none', label: t('ws-invoices.no_promotion') },
      ...availablePromotions.map((promotion): ComboboxOption => {
        const referralPercent = referralDiscountMap?.get(promotion.id);
        const labelValue =
          referralPercent !== undefined
            ? `${referralPercent || 0}%`
            : promotion.use_ratio
              ? `${promotion.value}%`
              : formatCurrency(promotion.value, currency);
        return {
          value: promotion.id,
          label: `${promotion.name || t('ws-invoices.unnamed_promotion')} (${labelValue})`,
        } as ComboboxOption;
      }),
    ];

    if (
      selectedPromotionId &&
      selectedPromotionId !== 'none' &&
      !availablePromotions.some((p) => p.id === selectedPromotionId)
    ) {
      const referralPercent = referralDiscountMap?.get(selectedPromotionId);
      const referralName =
        linkedPromotions.find((lp) => lp.promo_id === selectedPromotionId)
          ?.workspace_promotions?.name || t('ws-invoices.unnamed_promotion');
      list.splice(1, 0, {
        value: selectedPromotionId,
        label: `${referralName} (${referralPercent ?? 0}%)`,
      } as ComboboxOption);
    }

    return list;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
        <CreditCard className="h-4 w-4" />
        {t('ws-invoices.payment_settings')}
      </div>

      <div className="space-y-2">
        <Label htmlFor="wallet-select">
          {t('ws-wallets.wallet')}{' '}
          <span className={walletLabelClassName}>*</span>
        </Label>
        <Select value={selectedWalletId} onValueChange={onWalletChange}>
          <SelectTrigger>
            <SelectValue
              placeholder={t('ws-invoices.select_wallet_required')}
            />
          </SelectTrigger>
          <SelectContent>
            {wallets.map((wallet) => (
              <SelectItem key={wallet.id} value={wallet.id || 'invalid'}>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  <div className="flex flex-row gap-2">
                    <p className="font-medium">
                      {wallet.name || t('ws-invoices.unnamed_wallet')}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {wallet.type || 'STANDARD'} - {wallet.currency || 'USD'}
                    </p>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category-select">
          {t('ws-invoices.transaction_category')}{' '}
          <span className={categoryLabelClassName}>*</span>
        </Label>
        <Combobox
          t={t}
          options={categories.map(
            (category): ComboboxOption => ({
              value: category.id || '',
              label: category.name || t('ws-invoices.unnamed_category'),
            })
          )}
          selected={selectedCategoryId}
          onChange={(value) => onCategoryChange(value as string)}
          placeholder={t('ws-invoices.select_category_required')}
        />
      </div>

      {shouldShowPromotion && onPromotionChange && (
        <div className="space-y-2">
          <Label htmlFor="promotion-select">
            {t('invoices.add_promotion')}
          </Label>
          {promotionActions}
          <Combobox
            disabled={!selectedUserId}
            actions={promotionActionsList}
            actionsPosition={promotionActionsPosition}
            options={promotionOptions}
            selected={selectedPromotionId || 'none'}
            onChange={(value) => onPromotionChange(value as string)}
            placeholder={
              promotionPlaceholder ||
              (selectedUserId
                ? t('ws-invoices.search_promotions')
                : t('ws-invoices.select_user_first'))
            }
          />
        </div>
      )}
    </div>
  );
}
