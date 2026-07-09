'use client';

import { ExternalLink } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { getPayBillingUrl } from '@/lib/pay-app-url';

interface BillingSettingsProps {
  wsId: string;
}

export default function BillingSettings({ wsId }: BillingSettingsProps) {
  const t = useTranslations('billing');

  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-border bg-muted/30 p-6">
      <div className="space-y-1">
        <h3 className="font-semibold text-lg">{t('billing')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('manage-billing-on-pay')}
        </p>
      </div>
      <Button asChild>
        <a href={getPayBillingUrl(wsId)} rel="noreferrer">
          {t('open-billing')}
          <ExternalLink className="ml-2 h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}
