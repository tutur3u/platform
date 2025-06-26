'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
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
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import * as XLSX from 'xlsx';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
}

export default function ExportDialogContent({
  wsId,
  exportType,
  searchParams,
}: {
  wsId: string;
  exportType: string;
  searchParams: SearchParams;
}) {
  const t = useTranslations();
  const [filename, setFilename] = useState('');
  const [exportFileType, setExportFileType] = useState('excel');
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const defaultFilename = `${exportType}_export.${getFileExtension(exportFileType)}`;

  const downloadCSV = (data: WorkspaceUser[], filename: string) => {
    const csv = jsonToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExcel = (data: WorkspaceUser[], filename: string) => {
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

    const allData: WorkspaceUser[] = [];
    let currentPage = 1;
    const pageSize = 100;

    const includedGroups = Array.isArray(searchParams.includedGroups)
      ? searchParams.includedGroups
      : searchParams.includedGroups
        ? [searchParams.includedGroups]
        : [];
    const excludedGroups = Array.isArray(searchParams.excludedGroups)
      ? searchParams.excludedGroups
      : searchParams.excludedGroups
        ? [searchParams.excludedGroups]
        : [];

    while (true) {
      const { data } = await getData(wsId, {
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        q: searchParams.q,
        includedGroups,
        excludedGroups,
      });

      allData.push(...data);

      const progressValue =
        ((currentPage * pageSize) / (allData.length + 1)) * 100;
      setProgress(progressValue);

      if (data.length < pageSize) {
        setProgress(100);
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

    setIsExporting(false);
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
          <Label htmlFor="filename">{t('common.file-name')}</Label>
          <Input
            type="text"
            id="filename"
            value={filename}
            placeholder={defaultFilename}
            onChange={(e) => setFilename(e.target.value)}
            className="input-class w-full pb-4"
            disabled={isExporting}
          />
        </div>

        <div className="mt-2 grid w-full max-w-sm items-center gap-2">
          <Label htmlFor="fileType">{t('common.file-type')}</Label>
          <Select
            value={exportFileType}
            onValueChange={setExportFileType}
            disabled={isExporting}
          >
            <SelectTrigger className="w-full">
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
      </div>

      <DialogFooter className="justify-between">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {t('common.cancel')}
          </Button>
        </DialogClose>

        <Button onClick={handleExport} disabled={isExporting}>
          {isExporting ? t('common.processing') : t('common.export')}
        </Button>
      </DialogFooter>
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    includedGroups = [],
    excludedGroups = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: Array.isArray(includedGroups)
          ? includedGroups
          : [includedGroups],
        excluded_groups: Array.isArray(excludedGroups)
          ? excludedGroups
          : [excludedGroups],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize - 1;
    queryBuilder.range(start, end);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData(wsId, {
      q,
      page,
      pageSize,
      includedGroups,
      excludedGroups,
      retry: false,
    });
  }

  return { data } as unknown as { data: WorkspaceUser[] };
}
