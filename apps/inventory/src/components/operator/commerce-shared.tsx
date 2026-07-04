'use client';

import {
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  Percent,
  RotateCcw,
  ShieldCheck,
  TicketPercent,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { InventoryCommerceTab } from './operator-types';

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-primary/10 px-2 font-medium text-primary text-xs">
      {value.replaceAll('_', ' ')}
    </span>
  );
}

// A reservation that has been released ends up in the `cancelled` state; surface
// that as "Released" with a distinct icon/tone so terminal holds read clearly.
const CHECKOUT_STATUS_META: Record<
  string,
  { Icon: typeof Clock; key: string; tone: string }
> = {
  cancelled: {
    Icon: RotateCcw,
    key: 'released',
    tone: 'border-border bg-muted text-muted-foreground',
  },
  completed: {
    Icon: CheckCircle2,
    key: 'completed',
    tone: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
  },
  expired: {
    Icon: Ban,
    key: 'expired',
    tone: 'border-destructive/20 bg-destructive/10 text-destructive',
  },
  reserved: {
    Icon: Clock,
    key: 'reserved',
    tone: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
  },
};

export function CheckoutStatusBadge({ status }: { status: string }) {
  const t = useTranslations('inventory.operator.commerce');
  const meta = CHECKOUT_STATUS_META[status];
  const Icon = meta?.Icon;
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md border px-2 font-medium text-xs',
        meta?.tone ?? 'border-border bg-primary/10 text-primary'
      )}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {meta ? t(`status.${meta.key}`) : status.replaceAll('_', ' ')}
    </span>
  );
}

export function formatDate(value: string | null, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function CommerceTabs({
  onChange,
  tab,
}: {
  onChange: (tab: InventoryCommerceTab) => void;
  tab: InventoryCommerceTab;
}) {
  const t = useTranslations('inventory.operator.commerce.tabs');
  const tabs: Array<{
    icon: typeof CreditCard;
    label: string;
    value: InventoryCommerceTab;
  }> = [
    { icon: CreditCard, label: t('checkouts'), value: 'checkouts' },
    { icon: ShieldCheck, label: t('sales'), value: 'sales' },
    { icon: Percent, label: t('revenueShare'), value: 'revenue-share' },
    { icon: TicketPercent, label: t('promotions'), value: 'promotions' },
  ];

  return (
    <div
      aria-label={t('label')}
      className="inline-grid grid-cols-2 rounded-lg border border-border bg-muted/25 p-1 sm:grid-cols-4"
      role="tablist"
    >
      {tabs.map((item) => {
        const Icon = item.icon;
        const active = item.value === tab;

        return (
          <Button
            aria-selected={active}
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 font-medium text-sm transition ${
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            key={item.value}
            onClick={() => onChange(item.value)}
            role="tab"
            type="button"
            variant="ghost"
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
