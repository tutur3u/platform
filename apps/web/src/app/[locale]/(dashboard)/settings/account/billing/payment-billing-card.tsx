'use client';

import { CreditCard } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useTranslations } from 'next-intl';

export default function PaymentBillingCard() {
  const t = useTranslations('settings-account');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-blue-100 p-2.5 dark:bg-blue-900/30">
          <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">{t('payment-billing')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('payment-billing-description')}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <SettingItemTab
          title={t('payment-method')}
          description={t('no-payment-method')}
        >
          <Button variant="outline" size="sm" disabled>
            {t('add-payment-method')}
          </Button>
        </SettingItemTab>

        <SettingItemTab
          title={t('billing-address')}
          description={t('not-configured')}
        >
          <Button variant="outline" size="sm" disabled>
            {t('update-address')}
          </Button>
        </SettingItemTab>

        <SettingItemTab
          title={t('billing-history')}
          description={t('billing-history-description')}
        >
          <Button variant="outline" size="sm" disabled>
            {t('view-history')}
          </Button>
        </SettingItemTab>
      </div>
    </div>
  );
}
