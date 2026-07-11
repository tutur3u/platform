'use client';

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Upload,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { ChangeEvent } from 'react';

export function ImportSourcePanel({
  csv,
  fileError,
  fileName,
  isBusy,
  onCsvChange,
  onDownloadTemplate,
  onFileChange,
  onLoadCsv,
  onResetRows,
  onSourceNameChange,
  sourceName,
}: {
  csv: string;
  fileError: string | null;
  fileName: string;
  isBusy: boolean;
  onCsvChange: (value: string) => void;
  onDownloadTemplate: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadCsv: () => void;
  onResetRows: () => void;
  onSourceNameChange: (value: string) => void;
  sourceName: string;
}) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md border bg-muted p-2">
              <FileSpreadsheet className="h-5 w-5 text-dynamic-blue" />
            </div>
            <div>
              <h3 className="font-medium text-base">
                {t('bulk_import_title')}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t('bulk_import_description')}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="topic-import-source">{t('source_name')}</Label>
              <Input
                id="topic-import-source"
                onChange={(event) => onSourceNameChange(event.target.value)}
                placeholder={t('source_name_placeholder')}
                value={sourceName}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic-import-file">{t('upload_excel')}</Label>
              <Input
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={isBusy}
                id="topic-import-file"
                onChange={onFileChange}
                type="file"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-2"
              onClick={onDownloadTemplate}
              type="button"
              variant="outline"
            >
              <Download className="h-4 w-4" />
              {t('download_template')}
            </Button>
            <Button
              className="gap-2"
              disabled={isBusy}
              onClick={onResetRows}
              type="button"
              variant="ghost"
            >
              <RotateCcw className="h-4 w-4" />
              {t('bulk_reset_rows')}
            </Button>
          </div>

          {fileName ? (
            <div className="flex items-center gap-2 rounded-md border border-dynamic-green/20 bg-dynamic-green/10 px-3 py-2 text-dynamic-green text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span className="truncate">{fileName}</span>
            </div>
          ) : null}
          {fileError ? (
            <div className="flex items-center gap-2 rounded-md border border-dynamic-red/20 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-sm">
              <AlertCircle className="h-4 w-4" />
              {fileError}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div>
            <Label htmlFor="topic-import-csv">{t('paste_csv')}</Label>
            <p className="text-muted-foreground text-xs">
              {t('csv_fallback_helper')}
            </p>
          </div>
          <Textarea
            className="min-h-28 font-mono text-sm"
            disabled={isBusy}
            id="topic-import-csv"
            onChange={(event) => onCsvChange(event.target.value)}
            placeholder={t('csv_placeholder')}
            value={csv}
          />
          <Button
            className="w-full gap-2"
            disabled={isBusy || csv.trim().length === 0}
            onClick={onLoadCsv}
            type="button"
            variant="outline"
          >
            <Upload className="h-4 w-4" />
            {t('bulk_load_csv')}
          </Button>
        </div>
      </div>
    </div>
  );
}
