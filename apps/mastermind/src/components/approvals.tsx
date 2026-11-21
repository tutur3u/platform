import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import type { FleetSnapshot } from '../fleet/contract';
import { approvals } from '../fleet/model';
import { formatTime, useI18n } from '../i18n';
import { Section, SectionMessage } from './section';

export function ApprovalsSection({ snapshot }: { snapshot: FleetSnapshot }) {
  const { t, locale } = useI18n();
  const rows = approvals(snapshot);
  return (
    <Section
      id="approvals"
      title={t('nav.approvals')}
      note={t('approvals.note')}
    >
      {rows.length ? (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('approvals.time')}</TableHead>
                <TableHead>{t('approvals.decision')}</TableHead>
                <TableHead>{t('approvals.answer')}</TableHead>
                <TableHead>{t('approvals.via')}</TableHead>
                <TableHead>{t('approvals.pickup')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    {formatTime(locale, row.at)}
                  </TableCell>
                  <TableCell className="min-w-56">{row.title}</TableCell>
                  <TableCell>
                    {row.answer ??
                      (row.action ? t(`action.${row.action}`) : '—')}
                  </TableCell>
                  <TableCell>
                    {row.via ? (
                      <Badge variant="outline">{t(`channel.${row.via}`)}</Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.revision
                      ? `${row.pickedUp ? t('approvals.yes') : t('approvals.no')} · r${row.revision}`
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <SectionMessage>{t('approvals.empty')}</SectionMessage>
      )}
    </Section>
  );
}
