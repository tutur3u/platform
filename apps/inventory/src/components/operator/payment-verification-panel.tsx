'use client';

import {
  MonitorSmartphone,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
} from '@tuturuuu/icons';
import type { InventoryCheckoutSession } from '@tuturuuu/internal-api/inventory';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { PaymentTransactionRow } from './payment-transaction-row';

function TestChecklist({
  environment,
}: {
  environment: 'production' | 'sandbox';
}) {
  const t = useTranslations('inventory.operator.transactionVerification');
  const steps =
    environment === 'sandbox'
      ? (['storefront', 'simulator', 'status', 'stock'] as const)
      : (['approval', 'location', 'amount', 'receipt'] as const);

  return (
    <div className="grid gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-primary/10 text-primary">
          {environment === 'sandbox' ? (
            <MonitorSmartphone className="size-4" />
          ) : (
            <ShieldAlert className="size-4" />
          )}
        </span>
        <div>
          <h3 className="font-semibold">{t(`${environment}.title`)}</h3>
          <p className="mt-1 text-muted-foreground text-sm leading-6">
            {t(`${environment}.description`)}
          </p>
        </div>
      </div>
      <ol className="grid gap-2">
        {steps.map((step, index) => (
          <li
            className="flex gap-3 rounded-lg border border-border/70 bg-muted/15 p-3"
            key={step}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-background font-mono text-xs">
              {index + 1}
            </span>
            <div>
              <p className="font-medium text-sm">
                {t(`${environment}.steps.${step}.title`)}
              </p>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                {t(`${environment}.steps.${step}.description`)}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div
        className={cn(
          'flex items-start gap-2 rounded-lg border p-3 text-xs leading-5',
          environment === 'sandbox'
            ? 'border-dynamic-green/25 bg-dynamic-green/5'
            : 'border-destructive/25 bg-destructive/5'
        )}
      >
        {environment === 'sandbox' ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-dynamic-green" />
        ) : (
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        )}
        <span>{t(`${environment}.warning`)}</span>
      </div>
    </div>
  );
}

export function PaymentVerificationPanel({
  checkouts,
}: {
  checkouts: InventoryCheckoutSession[];
}) {
  const t = useTranslations('inventory.operator.transactionVerification');
  const paymentCheckouts = checkouts.filter(
    (row) => row.polarStatus || row.squareStatus
  );
  const squareCheckouts = paymentCheckouts.filter((row) => row.squareStatus);

  return (
    <section className="grid gap-4">
      <Tabs defaultValue="sandbox">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="sandbox">{t('sandbox.tab')}</TabsTrigger>
          <TabsTrigger value="production">{t('production.tab')}</TabsTrigger>
        </TabsList>
        <TabsContent value="sandbox">
          <TestChecklist environment="sandbox" />
        </TabsContent>
        <TabsContent value="production">
          <TestChecklist environment="production" />
        </TabsContent>
      </Tabs>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-border border-b p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-primary/10 text-primary">
              <ReceiptText className="size-4" />
            </span>
            <div>
              <h3 className="font-semibold">{t('activityTitle')}</h3>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('activityDescription', {
                  square: squareCheckouts.length,
                  total: paymentCheckouts.length,
                })}
              </p>
            </div>
          </div>
          <Badge variant="outline">
            {t('mostRecent', { count: paymentCheckouts.length })}
          </Badge>
        </div>
        {paymentCheckouts.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted-foreground text-sm">
            {t('empty')}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {paymentCheckouts.map((row) => (
              <PaymentTransactionRow key={row.id} row={row} />
            ))}
          </div>
        )}
        <Accordion collapsible type="single">
          <AccordionItem className="border-t px-5" value="evidence">
            <AccordionTrigger>{t('evidence.title')}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-6">
              {t('evidence.description')}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  );
}
