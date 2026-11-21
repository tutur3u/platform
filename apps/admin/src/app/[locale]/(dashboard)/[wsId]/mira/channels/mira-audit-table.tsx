'use client';

import type { MiraAuditRow } from '@tuturuuu/internal-api/infrastructure/mira';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime } from './mira-channels-format';

export function MiraAuditTable({ events }: { events: MiraAuditRow[] }) {
  const t = useTranslations('mira-channels');
  const locale = useLocale();

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('time')}</TableHead>
            <TableHead>{t('actor')}</TableHead>
            <TableHead>{t('workspace')}</TableHead>
            <TableHead>{t('action')}</TableHead>
            <TableHead>{t('generation_change')}</TableHead>
            <TableHead>{t('note')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={6}>
                {t('empty_audit')}
              </TableCell>
            </TableRow>
          ) : (
            events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>{formatDateTime(event.createdAt, locale)}</TableCell>
                <TableCell>{t(`actors.${event.actorKind}`)}</TableCell>
                <TableCell className="font-mono text-xs">
                  {event.wsId}
                </TableCell>
                <TableCell>
                  {event.action} · {event.reasonCode}
                </TableCell>
                <TableCell>
                  {event.oldGeneration != null && event.newGeneration != null
                    ? `${event.oldGeneration} → ${event.newGeneration}`
                    : t('none')}
                </TableCell>
                <TableCell className="max-w-xs whitespace-pre-wrap break-words">
                  {event.note ?? t('none')}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
