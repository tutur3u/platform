import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { CreditCard } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';

export default async function PaymentBillingCard() {
  const t = await getTranslations('settings-account');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
            <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle>{t('payment-billing')}</CardTitle>
            <CardDescription>
              {t('payment-billing-description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">{t('payment-method')}</p>
              <p className="text-muted-foreground text-xs">
                {t('no-payment-method')}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled>
              {t('add-payment-method')}
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">{t('billing-address')}</p>
              <p className="text-muted-foreground text-xs">
                {t('not-configured')}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled>
              {t('update-address')}
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">{t('billing-history')}</p>
              <p className="text-muted-foreground text-xs">
                {t('billing-history-description')}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled>
              {t('view-history')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
