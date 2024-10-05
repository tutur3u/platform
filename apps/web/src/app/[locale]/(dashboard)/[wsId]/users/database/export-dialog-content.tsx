'use client';

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
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';

export default function ExportDialogContent({ wsId }: { wsId: string }) {
  const t = useTranslations();

  const [exportFileType, setExportFileType] = useState('excel');

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
    const allData: WorkspaceUser[] = [];
    let currentPage = 1;
    const pageSize = 100;

    while (true) {
      const { data } = await getData(wsId, {
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });

      allData.push(...data);


      if (data.length < pageSize) {
        break;
      }

      currentPage++;
    }


    if (exportFileType === 'csv') {
      downloadCSV(allData, `export_${wsId}.csv`);
    } else if (exportFileType === 'excel') {
      downloadExcel(allData, `export_${wsId}.xlsx`);
    }
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
        <Button onClick={handleExport}>{t('common.export')}</Button>
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
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: [],
        excluded_groups: [],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

  const parsedPage = parseInt(page);
  const parsedSize = parseInt(pageSize);
  const start = (parsedPage - 1) * parsedSize;
  const end = parsedPage * parsedSize - 1;

  queryBuilder.range(start, end).limit(parsedSize);

  const { data, error, count } = await queryBuilder;

  if (error) {
    throw error;
  }

  return { data, count } as unknown as { data: WorkspaceUser[]; count: number };
}
