'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useId, useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import { XLSX } from '../../../../xlsx';
import { getData, type TransactionExportRow } from './export-utils';

export default function ExportDialogContent({
  wsId,
  exportType,
}: {
  wsId: string;
  exportType: string;
}) {
  const t = useTranslations();

  const [q] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({
      shallow: true,
    })
  );

  const [userIds] = useQueryState(
    'userIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [categoryIds] = useQueryState(
    'categoryIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [walletIds] = useQueryState(
    'walletIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [start] = useQueryState(
    'start',
    parseAsString.withOptions({
      shallow: true,
    })
  );

  const [end] = useQueryState(
    'end',
    parseAsString.withOptions({
      shallow: true,
    })
  );

  const [exportFileType, setExportFileType] = useState('excel');
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [filename, setFilename] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);

  const filenameId = useId();
  const fileTypeId = useId();

  const defaultFilename = `${exportType}_export.${getFileExtension(exportFileType)}`;

  const downloadCSV = (data: TransactionExportRow[], filename: string) => {
    const csv = jsonToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExcel = (data: TransactionExportRow[], filename: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setExportError(null);

    try {
      const allData: TransactionExportRow[] = [];
      let currentPage = 1;
      const pageSize = 1000;

      while (true) {
        const { data, count } = await getData(wsId, {
          q: q || undefined,
          page: currentPage.toString(),
          pageSize: pageSize.toString(),
          userIds,
          categoryIds,
          walletIds,
          start: start || undefined,
          end: end || undefined,
        });

        allData.push(...data);

        const totalPages = Math.ceil(count / pageSize);
        // Guard against division by zero when no transactions match filters
        const progressValue =
          totalPages > 0 ? (currentPage / totalPages) * 100 : 100;
        setProgress(progressValue);

        if (data.length < pageSize) {
          break;
        }

        currentPage++;
      }

      setProgress(100);

      if (exportFileType === 'csv') {
        downloadCSV(
          allData,
          `${(filename || defaultFilename)
            // remove all .csv from the filename
            .replace(/\.csv/g, '')}.csv`
        );
      } else if (exportFileType === 'excel') {
        downloadExcel(
          allData,
          `${(filename || defaultFilename)
            // remove all .xlsx from the filename
            .replace(/\.xlsx/g, '')}.xlsx`
        );
      }

      toast.success(t('common.export-success'));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t('common.export-error');
      setExportError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  function getFileExtension(fileType: string) {
    switch (fileType) {
      case 'csv':
        return 'csv';
      case 'excel':
        return 'xlsx';
      default:
        return '';
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('common.export')}</DialogTitle>
        <DialogDescription>{t('common.export-content')}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-1">
        <div className="grid w-full max-w-sm items-center gap-2">
          <Label htmlFor={filenameId}>{t('common.file-name')}</Label>
          <Input
            type="text"
            id={filenameId}
            value={filename}
            placeholder={defaultFilename}
            onChange={(e) => setFilename(e.target.value)}
            className="input-class w-full pb-4"
            disabled={isExporting}
          />
        </div>

        <div className="mt-2 grid w-full max-w-sm items-center gap-2">
          <Label htmlFor={fileTypeId}>{t('common.file-type')}</Label>
          <Select
            value={exportFileType}
            onValueChange={setExportFileType}
            disabled={isExporting}
          >
            <SelectTrigger className="w-full" id={fileTypeId}>
              <SelectValue placeholder="File type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excel">Excel</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isExporting && (
          <div>
            <Progress value={progress} className="h-2 w-full" />
          </div>
        )}

        {exportError && (
          <div className="mt-2 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
            {exportError}
          </div>
        )}
      </div>

      <DialogFooter className="justify-between">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {t('common.cancel')}
          </Button>
        </DialogClose>
        <Button onClick={handleExport} disabled={isExporting}>
          {isExporting ? t('common.loading') : t('common.export')}
        </Button>
      </DialogFooter>
    </>
  );
}
