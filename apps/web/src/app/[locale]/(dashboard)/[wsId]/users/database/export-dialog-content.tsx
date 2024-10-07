"use client";

import * as React from "react";
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@repo/ui/components/ui/button';
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import * as XLSX from 'xlsx';
import { Progress } from "@repo/ui/components/ui/progress";

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

  const [exportFileType, setExportFileType] = useState('excel');
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const downloadCSV = (data: any[], filename: string) => {
    const csv = jsonToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExcel = (data: any[], filename: string) => {
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

      const progressValue = (currentPage * pageSize) / (allData.length + 1) * 100;
      setProgress(progressValue);

      if (data.length < pageSize) {
        setProgress(100);
        break;
      }

      currentPage++;
    }

    if (exportFileType === 'csv') {
      downloadCSV(allData, `export_${exportType}.csv`);
    } else if (exportFileType === 'excel') {
      downloadExcel(allData, `export_${exportType}.xlsx`);
    }

    setIsExporting(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('common.export')}</DialogTitle>
        <DialogDescription>{t('common.export-content')}</DialogDescription>
        <Select value={exportFileType} onValueChange={setExportFileType}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="File type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="excel">Excel</SelectItem>
            <SelectItem value="csv">CSV</SelectItem>
          </SelectContent>
        </Select>
      </DialogHeader>

      <DialogFooter className="justify-between">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {t('common.cancel')}
          </Button>
        </DialogClose>

        <Button onClick={handleExport} disabled={isExporting}>
          {isExporting ? 'loading' : t('common.export')}
        </Button>
      </DialogFooter>

      {isExporting && (
        <div className="mt-4">
          <Progress value={progress} className="w-full" />
        </div>
      )}
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
  const supabase = await createClient();

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
    return getData(wsId, { q, page, pageSize, includedGroups, excludedGroups, retry: false });
  } 

  return { data } as unknown as {data: WorkspaceUser[]};
}
