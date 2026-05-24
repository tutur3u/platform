'use client';

import { CheckCircle2 } from '@tuturuuu/icons';
import type { TopicAnnouncementImportResult } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';

export function ImportSummary({
  importResult,
  invalidCount,
  rowCount,
  validCount,
}: {
  importResult: TopicAnnouncementImportResult | null;
  invalidCount: number;
  rowCount: number;
  validCount: number;
}) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <SummaryCard label={t('import_total_rows')} value={rowCount} />
      <SummaryCard label={t('import_valid_rows')} value={validCount} />
      <SummaryCard label={t('import_invalid_rows')} value={invalidCount} />

      {importResult ? (
        <div className="rounded-md border border-dynamic-green/20 bg-dynamic-green/10 p-3 text-dynamic-green sm:col-span-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {t('import_result_summary', {
                  announcements: importResult.createdAnnouncements.toString(),
                  contacts: importResult.createdContacts.toString(),
                })}
              </p>
              {importResult.rowErrors.length > 0 ? (
                <p>
                  {t('import_result_errors', {
                    count: importResult.rowErrors.length.toString(),
                  })}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 font-semibold text-2xl">{value}</p>
    </div>
  );
}
