'use client';

import { salesPeriodAutoDefaultNotice } from '@tuturuuu/inventory-core/sales-period-default-policy';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

const NOTICE_KEYS = {
  denied: 'autoDefaultDenied',
  off: 'autoDefaultOff',
  on: 'autoDefaultOn',
  unavailable: 'autoDefaultUnavailable',
} as const;

export function SalesPeriodAutoDefaultField({
  canEdit,
  enabled,
  onCheckedChange,
  pending,
}: {
  canEdit: boolean;
  enabled: boolean | null;
  onCheckedChange: (checked: boolean) => void;
  pending: boolean;
}) {
  const t = useTranslations('inventory.operator.commerce.periods');
  const notice = salesPeriodAutoDefaultNotice({ canEdit, enabled });
  const editable = notice === 'on' || notice === 'off';

  return (
    <div className="grid gap-1.5 rounded-lg border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-sm">{t('autoDefault')}</span>
        <Switch
          aria-label={t('autoDefault')}
          checked={enabled === true}
          disabled={!editable || pending}
          onCheckedChange={onCheckedChange}
        />
      </div>
      <p className="text-muted-foreground text-xs">{t(NOTICE_KEYS[notice])}</p>
    </div>
  );
}
