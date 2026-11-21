'use client';

import type { InfrastructureCostInvoice } from '@tuturuuu/internal-api/infrastructure';
import { ExternalLink } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useFormatter, useTranslations } from 'next-intl';
import { CostSection, SectionMessage } from './cost-section';
import { financeTransactionUrl, type Section } from './cost-view';

export function CostInvoices({
  financeOrigin,
  invoices,
  rootWorkspaceId,
}: {
  financeOrigin: string;
  invoices: Section<InfrastructureCostInvoice[]>;
  rootWorkspaceId: string;
}) {
  const t = useTranslations('infrastructure-costs');
  const format = useFormatter();

  return (
    <CostSection title={t('invoices.title')}>
      {invoices.kind === 'unavailable' ? (
        <SectionMessage tone="error">{t('section_unavailable')}</SectionMessage>
      ) : invoices.data.length === 0 ? (
        <SectionMessage>{t('invoices.empty')}</SectionMessage>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('invoices.issued')}</TableHead>
                <TableHead>{t('invoices.provider')}</TableHead>
                <TableHead>{t('invoices.app')}</TableHead>
                <TableHead className="text-end">
                  {t('invoices.amount')}
                </TableHead>
                <TableHead>{t('invoices.finance')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.data.map((invoice) => {
                const href = financeTransactionUrl(
                  financeOrigin,
                  rootWorkspaceId,
                  invoice.financeTransactionId
                );
                return (
                  <TableRow
                    key={JSON.stringify([
                      invoice.provider,
                      invoice.accountId,
                      invoice.app,
                      invoice.reference,
                    ])}
                  >
                    <TableCell className="tabular-nums">
                      {invoice.issuedOn}
                    </TableCell>
                    <TableCell>{invoice.provider}</TableCell>
                    <TableCell>{invoice.app}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {format.number(invoice.amountUsd, {
                        currency: 'USD',
                        style: 'currency',
                      })}
                    </TableCell>
                    <TableCell>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
                        >
                          {t('invoices.open_transaction')}
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      ) : (
                        <Badge variant="secondary">
                          {t('invoices.unposted')}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </CostSection>
  );
}
