'use client';

import type { FeeLockListRow } from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import { Badge } from '@tuturuuu/ui/badge';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '@tuturuuu/ui/finance/shared/charts/use-finance-confidential-visibility';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useLocale, useTranslations } from 'next-intl';

/**
 * Currency formatter for fee-lock amounts. A malformed currency code makes
 * Intl.NumberFormat throw, so fall back to plain number formatting.
 */
export function createFeeLockMoneyFormatter(locale: string, currency: string) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency });
  } catch {
    return new Intl.NumberFormat(locale);
  }
}

interface Props {
  rows: FeeLockListRow[];
  currency: string;
}

export function FeeLockTable({ rows, currency }: Props) {
  const t = useTranslations('ws-fee-lock');
  const locale = useLocale();
  const { isConfidential } = useFinanceConfidentialVisibility();
  const money = createFeeLockMoneyFormatter(locale, currency);
  const amount = (value: number | null) =>
    value === null
      ? '—'
      : isConfidential
        ? FINANCE_HIDDEN_AMOUNT
        : money.format(value);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('student')}</TableHead>
            <TableHead>{t('classes')}</TableHead>
            <TableHead className="text-right">{t('baseline')}</TableHead>
            <TableHead className="text-right">{t('locked_total')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead>{t('last_editor')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.student_id}>
              <TableCell className="font-medium">{row.student_name}</TableCell>
              <TableCell className="text-muted-foreground">
                {row.classes.map((group) => group.group_name).join(', ')}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {amount(row.baseline_total)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {amount(row.lock?.total_amount ?? null)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    row.lock?.status === 'locked' ? 'default' : 'outline'
                  }
                >
                  {row.lock?.status === 'locked'
                    ? t('status_locked', { revision: row.lock.revision })
                    : t(row.lock ? 'status_draft' : 'status_none')}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.lock?.updated_by_name ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
