'use client';

import { ExternalLink } from '@tuturuuu/icons';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { formatCurrency } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useInfiniteUserInvoices } from '../hooks';

interface Props {
  wsId: string;
  userId: string;
  currency?: string;
  currencyLocale?: string;
}

export function InvoiceUserHistoryAccordion({
  wsId,
  userId,
  currency = 'VND',
  currencyLocale = 'vi-VN',
}: Props) {
  const t = useTranslations();

  const {
    data: userInvoicesData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteUserInvoices(wsId, userId);

  const invoices = userInvoicesData?.pages.flatMap((page) => page.data) || [];

  if (isLoading) {
    return (
      <div className="py-4 text-center">
        <p className="text-muted-foreground text-sm">
          {t('ws-invoices.loading_user_history')}
        </p>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-muted-foreground text-sm">
          {t('ws-invoices.no_transaction_or_invoice_history')}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="invoices" className="border-none">
          <AccordionTrigger className="hover:no-underline">
            {t('ws-invoices.plural')} ({userInvoicesData?.pages[0]?.count ?? 0})
          </AccordionTrigger>
          <AccordionContent>
            <ScrollArea className="h-75 w-full rounded-md border p-4">
              <div className="space-y-3">
                {invoices.map((invoice: Invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-dynamic-surface/50"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {invoice.notice ||
                            t('ws-invoices.invoice_id_short', {
                              id: invoice.id.slice(-8),
                            })}
                        </p>
                        <Link
                          href={`/${wsId}/finance/invoices/${invoice.id}`}
                          className="text-muted-foreground transition-colors hover:text-primary"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>

                      {invoice.creator && (
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <span>{t('ws-invoices.creator')}:</span>
                          <div className="flex items-center gap-1">
                            <Avatar className="h-4 w-4">
                              <AvatarImage
                                src={invoice.creator.avatar_url || undefined}
                              />
                              <AvatarFallback className="text-[8px]">
                                {(
                                  invoice.creator.display_name ||
                                  invoice.creator.full_name ||
                                  '?'
                                ).slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {invoice.creator.display_name ||
                                invoice.creator.full_name}
                            </span>
                          </div>
                        </div>
                      )}
                      <p className="text-muted-foreground text-xs">
                        {invoice.created_at
                          ? new Date(invoice.created_at).toLocaleDateString()
                          : t('ws-invoices.no_date')}
                      </p>
                      {invoice.note && (
                        <p className="truncate text-muted-foreground text-xs">
                          {t('ws-invoices.note')}: {invoice.note}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-dynamic-blue">
                        {invoice.price !== undefined
                          ? formatCurrency(
                              invoice.price + (invoice.total_diff || 0),
                              currencyLocale,
                              currency
                            )
                          : '-'}
                      </p>
                    </div>
                  </div>
                ))}

                {hasNextPage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage
                      ? t('ws-invoices.loading')
                      : t('ws-invoices.load_more')}
                  </Button>
                )}
              </div>
            </ScrollArea>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
