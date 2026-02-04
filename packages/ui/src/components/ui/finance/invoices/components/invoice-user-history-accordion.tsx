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
import { useEffect, useRef, useState } from 'react';
import { useInfiniteUserInvoices } from '../hooks';

interface Props {
  wsId: string;
  userId: string;
  currency?: string;
}

export function InvoiceUserHistoryAccordion({
  wsId,
  userId,
  currency = 'VND',
}: Props) {
  const t = useTranslations();

  const {
    data: userInvoicesData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteUserInvoices(wsId, userId);

  const [isOpen, setIsOpen] = useState(false);
  const scrollAreaWrapperRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const invoices = userInvoicesData?.pages.flatMap((page) => page.data) || [];

  useEffect(() => {
    if (!isOpen || !loadMoreRef.current || !hasNextPage || isFetchingNextPage)
      return;

    const scrollViewport = scrollAreaWrapperRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]'
    ) as Element | null;

    if (!scrollViewport) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { root: scrollViewport, threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [isOpen, hasNextPage, isFetchingNextPage, fetchNextPage]);

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
      <Accordion
        type="single"
        collapsible
        className="w-full"
        onValueChange={(value) => setIsOpen(value === 'invoices')}
      >
        <AccordionItem value="invoices" className="border-none">
          <AccordionTrigger className="hover:no-underline">
            {t('ws-invoices.plural')} ({userInvoicesData?.pages[0]?.count ?? 0})
          </AccordionTrigger>
          <AccordionContent>
            <div ref={scrollAreaWrapperRef}>
              <ScrollArea className="h-75 w-full rounded-md border p-3">
                <div className="space-y-3">
                  {invoices.map((invoice: Invoice) => (
                    <div
                      key={invoice.id}
                      className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-dynamic-surface/50"
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <p className="break-all font-medium text-sm leading-tight">
                            {invoice.notice ||
                              t('ws-invoices.invoice_id_short', {
                                id: invoice.id.slice(-8),
                              })}
                          </p>
                          <Link
                            href={`/${wsId}/finance/invoices/${invoice.id}`}
                            className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold text-dynamic-blue text-sm">
                            {invoice.price !== undefined
                              ? formatCurrency(
                                  invoice.price + (invoice.total_diff || 0),
                                  currency
                                )
                              : '-'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        {invoice.creator && (
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <span className="shrink-0">
                              {t('ws-invoices.creator')}:
                            </span>
                            <div className="flex min-w-0 items-center gap-1">
                              <Avatar className="h-4 w-4 shrink-0">
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
                              <span className="truncate font-medium">
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
                    </div>
                  ))}

                  <div ref={loadMoreRef} className="py-2">
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
                </div>
              </ScrollArea>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
