'use client';

import { CircleDollarSign, Info, ShieldCheck } from '@tuturuuu/icons';
import type { InventorySquareCatalogLink } from '@tuturuuu/internal-api/inventory';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose } from '@tuturuuu/ui/dialog';
import { useLocale, useTranslations } from 'next-intl';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import { getSquareLinkPresentation } from './square-link-presentation';

export function SquareLinkReviewDialog({
  link,
  onManageSync,
  onOpenChange,
}: {
  link: InventorySquareCatalogLink | null;
  onManageSync: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('inventory.operator.squareObservability.review');
  const locale = useLocale();
  const presentation = link ? getSquareLinkPresentation(link) : null;
  const parsedPrice = Number(presentation?.squarePrice);
  const precision = Math.max(
    2,
    presentation?.squarePrice?.split('.')[1]?.length ?? 0
  );
  const squarePrice =
    Number.isFinite(parsedPrice) && presentation?.currency
      ? new Intl.NumberFormat(locale, {
          currency: presentation.currency,
          currencyDisplay: 'code',
          maximumFractionDigits: precision,
          minimumFractionDigits: precision,
          style: 'currency',
        }).format(parsedPrice)
      : t('unknownPrice');

  return (
    <Dialog onOpenChange={onOpenChange} open={link !== null}>
      <OperatorDialogContent size="md">
        <OperatorDialogHeader
          description={link?.productName ?? t('description')}
          title={t('title')}
        />
        <OperatorDialogTabs
          tabs={[
            {
              content: (
                <div className="grid gap-4">
                  <div className="flex items-start gap-3 rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/5 p-4">
                    <CircleDollarSign className="mt-0.5 size-5 shrink-0 text-dynamic-orange" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{t('priceTitle')}</p>
                        <Badge variant="warning">{squarePrice}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground text-sm leading-6">
                        {t('priceDescription')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border border-dynamic-green/30 bg-dynamic-green/5 p-4">
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-dynamic-green" />
                    <div>
                      <p className="font-semibold text-sm">{t('safeTitle')}</p>
                      <p className="mt-1 text-muted-foreground text-sm leading-6">
                        {t('safeDescription')}
                      </p>
                    </div>
                  </div>
                  <Accordion
                    className="rounded-lg border border-border px-4"
                    collapsible
                    type="single"
                  >
                    <AccordionItem value="identifiers">
                      <AccordionTrigger>
                        {t('identifiersTitle')}
                      </AccordionTrigger>
                      <AccordionContent>
                        <dl className="grid gap-3 text-xs sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">
                              {t('squareItem')}
                            </dt>
                            <dd className="mt-1 break-all font-mono">
                              {link?.squareItemId}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              {t('squareVariation')}
                            </dt>
                            <dd className="mt-1 break-all font-mono">
                              {link?.squareVariationId}
                            </dd>
                          </div>
                        </dl>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              ),
              icon: <Info className="size-4" />,
              label: t('tabs.explanation'),
              value: 'explanation',
            },
            {
              content: (
                <div className="grid gap-4">
                  <div>
                    <p className="font-semibold">{t('resolutionTitle')}</p>
                    <p className="mt-1 text-muted-foreground text-sm leading-6">
                      {t('resolutionDescription')}
                    </p>
                  </div>
                  <ol className="grid gap-3">
                    {(['one', 'two', 'three'] as const).map((step, index) => (
                      <li className="flex items-start gap-3" key={step}>
                        <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-muted font-mono text-xs">
                          {index + 1}
                        </span>
                        <p className="text-muted-foreground text-sm leading-6">
                          {t(`steps.${step}`, { price: squarePrice })}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              ),
              icon: <CircleDollarSign className="size-4" />,
              label: t('tabs.resolve'),
              value: 'resolve',
            },
          ]}
        />
        <OperatorDialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('close')}
            </Button>
          </DialogClose>
          <Button onClick={onManageSync} type="button">
            {t('retryImport')}
          </Button>
        </OperatorDialogFooter>
      </OperatorDialogContent>
    </Dialog>
  );
}
