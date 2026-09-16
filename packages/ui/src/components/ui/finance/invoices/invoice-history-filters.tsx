'use client';
import type { InvoiceHistoryEntry } from '@tuturuuu/internal-api/finance';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

export interface InvoiceHistoryFilters {
  entity: InvoiceHistoryEntry['entity_type'] | 'all';
  action: InvoiceHistoryEntry['operation'] | 'all';
  from: string;
  to: string;
  sort: 'asc' | 'desc';
}
export const DEFAULT_HISTORY_FILTERS: InvoiceHistoryFilters = {
  entity: 'all',
  action: 'all',
  from: '',
  to: '',
  sort: 'desc',
};

export function InvoiceHistoryFilterBar({
  value,
  onChange,
}: {
  value: InvoiceHistoryFilters;
  onChange: (filters: InvoiceHistoryFilters) => void;
}) {
  const t = useTranslations('ws-invoices');
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="space-y-1">
        <Label htmlFor="invoice-history-entity">
          {t('activity_record_type')}
        </Label>
        <Select
          value={value.entity}
          onValueChange={(entity: InvoiceHistoryFilters['entity']) =>
            onChange({ ...value, entity })
          }
        >
          <SelectTrigger id="invoice-history-entity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('activity_all_types')}</SelectItem>
            {(
              ['invoice', 'product', 'promotion', 'group', 'payment'] as const
            ).map((entity) => (
              <SelectItem key={entity} value={entity}>
                {t(`history_entities.${entity}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoice-history-action">{t('activity_action')}</Label>
        <Select
          value={value.action}
          onValueChange={(action: InvoiceHistoryFilters['action']) =>
            onChange({ ...value, action })
          }
        >
          <SelectTrigger id="invoice-history-action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('activity_all_actions')}</SelectItem>
            <SelectItem value="INSERT">{t('activity_created')}</SelectItem>
            <SelectItem value="UPDATE">{t('activity_updated')}</SelectItem>
            <SelectItem value="DELETE">{t('activity_deleted')}</SelectItem>
            <SelectItem value="RESTORE">{t('activity_restored')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoice-history-from">{t('activity_from')}</Label>
        <Input
          id="invoice-history-from"
          type="date"
          value={value.from}
          max={value.to || undefined}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoice-history-to">{t('activity_to')}</Label>
        <Input
          id="invoice-history-to"
          type="date"
          value={value.to}
          min={value.from || undefined}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
      </div>
      <div className="col-span-2 space-y-1 lg:col-span-1">
        <Label htmlFor="invoice-history-sort">{t('activity_sort')}</Label>
        <Select
          value={value.sort}
          onValueChange={(sort: 'asc' | 'desc') => onChange({ ...value, sort })}
        >
          <SelectTrigger id="invoice-history-sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">{t('activity_newest')}</SelectItem>
            <SelectItem value="asc">{t('activity_oldest')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
