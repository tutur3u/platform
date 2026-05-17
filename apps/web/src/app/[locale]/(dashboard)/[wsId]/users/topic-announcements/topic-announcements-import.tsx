'use client';

import { Upload } from '@tuturuuu/icons';
import type { TopicAnnouncementImportPayload } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { parseTopicAnnouncementCsv } from './import-utils';

interface Props {
  isImporting: boolean;
  onImport: (payload: TopicAnnouncementImportPayload) => void;
}

export function ImportPanel({ isImporting, onImport }: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [sourceName, setSourceName] = useState('');
  const [csv, setCsv] = useState('');
  const rows = useMemo(() => parseTopicAnnouncementCsv(csv), [csv]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4">
        <div className="space-y-2">
          <Label htmlFor="topic-import-source">{t('source_name')}</Label>
          <Input
            id="topic-import-source"
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
          />
        </div>
        <div className="mt-3 space-y-2">
          <Label htmlFor="topic-import-csv">{t('paste_csv')}</Label>
          <Textarea
            className="min-h-56 font-mono text-sm"
            id="topic-import-csv"
            placeholder={t('csv_placeholder')}
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {t('rows_detected', { count: rows.length.toString() })}
          </p>
          <Button
            className="gap-2"
            disabled={isImporting || rows.length === 0}
            onClick={() =>
              onImport({
                rows,
                sourceName: sourceName || undefined,
                sourceType: 'foreign_teacher_schedule',
              })
            }
          >
            <Upload className="h-4 w-4" />
            {t('import_rows')}
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-4 border-b px-3 py-2 font-medium text-sm">
          <span>{t('contact_name')}</span>
          <span>{t('email')}</span>
          <span>{t('classLabel')}</span>
          <span>{t('topic')}</span>
        </div>
        {rows.slice(0, 10).map((row, index) => (
          <div className="grid grid-cols-4 px-3 py-2 text-sm" key={index}>
            <span>{row.contactName}</span>
            <span>{row.contactEmail}</span>
            <span>{row.classLabel}</span>
            <span className="truncate">{row.topic}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
