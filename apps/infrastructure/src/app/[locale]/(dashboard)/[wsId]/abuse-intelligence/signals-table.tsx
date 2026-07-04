'use client';

import type { AbuseActivitySignal } from '@tuturuuu/internal-api/infrastructure/abuse';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';
import { formatDateTime, getSignalTone } from './abuse-intelligence-format';

export function AbuseSignalsTable({
  signals,
}: {
  signals: AbuseActivitySignal[];
}) {
  const t = useTranslations('abuse-intelligence');

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tables.signal')}</TableHead>
            <TableHead>{t('tables.subject')}</TableHead>
            <TableHead>{t('tables.route')}</TableHead>
            <TableHead>{t('tables.delta')}</TableHead>
            <TableHead>{t('tables.created')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {signals.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={5}>
                {t('empty.signals')}
              </TableCell>
            </TableRow>
          ) : (
            signals.map((signal) => (
              <TableRow key={signal.id}>
                <TableCell>
                  <Badge className={getSignalTone(signal.signal_type)}>
                    {t(`signals.${signal.signal_type}`)}
                  </Badge>
                  {signal.reason_code ? (
                    <div className="mt-1 text-muted-foreground text-xs">
                      {signal.reason_code}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="max-w-[260px] truncate font-mono text-xs">
                    {signal.subject_key}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-w-[260px] truncate font-mono text-xs">
                    {signal.method ?? '-'} {signal.route ?? '-'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{signal.score_delta}</div>
                  <div className="text-muted-foreground text-xs">
                    {t('confidence', { value: signal.confidence_delta })}
                  </div>
                </TableCell>
                <TableCell>{formatDateTime(signal.created_at)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
