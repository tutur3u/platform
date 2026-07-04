'use client';

import { Ban, CheckCircle2, Clock, RotateCcw } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

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
