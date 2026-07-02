'use client';

import type { AbuseReputationSubject } from '@tuturuuu/internal-api/infrastructure/abuse';
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
import { formatDateTime, getTierTone } from './abuse-intelligence-format';

export function AbuseSubjectsTable({
  subjects,
}: {
  subjects: AbuseReputationSubject[];
}) {
  const t = useTranslations('abuse-intelligence');

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tables.subject')}</TableHead>
            <TableHead>{t('tables.tier')}</TableHead>
            <TableHead>{t('tables.score')}</TableHead>
            <TableHead>{t('tables.signals')}</TableHead>
            <TableHead>{t('tables.last_seen')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subjects.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={5}>
                {t('empty.subjects')}
              </TableCell>
            </TableRow>
          ) : (
            subjects.map((subject) => (
              <TableRow key={subject.id}>
                <TableCell>
                  <div className="space-y-1">
                    <Badge variant="outline">{subject.subject_type}</Badge>
                    <div className="max-w-[360px] truncate font-mono text-xs">
                      {subject.subject_key}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={getTierTone(subject.tier)}>
                    {t(`tiers.${subject.tier}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{subject.reputation_score}</div>
                  <div className="text-muted-foreground text-xs">
                    {t('confidence', { value: subject.confidence_score })}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {t('positive_negative', {
                      negative: subject.negative_signal_count,
                      positive: subject.positive_signal_count,
                    })}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t('multiplier', { value: subject.trust_multiplier })}
                  </div>
                </TableCell>
                <TableCell>{formatDateTime(subject.last_seen_at)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
