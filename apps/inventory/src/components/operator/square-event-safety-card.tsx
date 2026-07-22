'use client';

import {
  CreditCard,
  MonitorSmartphone,
  ShieldCheck,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

const protections = [
  { icon: Users, key: 'staff' },
  { icon: CreditCard, key: 'terminal' },
  { icon: MonitorSmartphone, key: 'pos' },
] as const;

export function SquareEventSafetyCard() {
  const t = useTranslations('inventory.operator.square.eventSafety');

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-dynamic-green">
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{t('title')}</h3>
              <Badge variant="success">{t('badge')}</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-5">
              {t('description')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-3">
        {protections.map(({ icon: Icon, key }) => (
          <div className="bg-card p-4" key={key}>
            <Icon className="size-4 text-muted-foreground" />
            <p className="mt-3 font-medium text-sm">{t(`${key}.title`)}</p>
            <p className="mt-1 text-muted-foreground text-xs leading-5">
              {t(`${key}.description`)}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t bg-muted/15 px-4 py-3 text-muted-foreground text-xs leading-5">
        {t('membersNote')}
      </div>
    </section>
  );
}
