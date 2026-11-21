'use client';

import type { InfrastructureRecordedCost } from '@tuturuuu/internal-api/infrastructure';
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
import type { Section } from './cost-view';

// Run-level provider costs that apps record as they call a provider.
export function CostRecorded({
  recorded,
}: {
  recorded: Section<InfrastructureRecordedCost[]>;
}) {
  const t = useTranslations('infrastructure-costs');
  const format = useFormatter();
  if (recorded.kind === 'ok' && recorded.data.length === 0) return null;

  return (
    <CostSection title={t('recorded.title')}>
      {recorded.kind === 'unavailable' ? (
        <SectionMessage tone="error">{t('section_unavailable')}</SectionMessage>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('recorded.month')}</TableHead>
                <TableHead>{t('recorded.provider')}</TableHead>
                <TableHead>{t('recorded.service')}</TableHead>
                <TableHead>{t('recorded.app')}</TableHead>
                <TableHead className="text-end">
                  {t('recorded.amount')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recorded.data.map((row) => (
                <TableRow
                  key={JSON.stringify([
                    row.month,
                    row.provider,
                    row.service,
                    row.app,
                  ])}
                >
                  <TableCell className="tabular-nums">{row.month}</TableCell>
                  <TableCell>{row.provider}</TableCell>
                  <TableCell>{row.service}</TableCell>
                  <TableCell>{row.app}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {format.number(row.amountUsd, {
                      currency: 'USD',
                      style: 'currency',
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CostSection>
  );
}
