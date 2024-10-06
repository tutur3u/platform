'use client';

import { Transaction } from '@/types/primitives/Transaction';
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

export default function ExportDialogContent({
  wsId,
  exportType,
}: {
  wsId: string;
  exportType: string;
}) {
  const t = useTranslations();

  const [exportFileType, setExportFileType] = useState('excel');

  const downloadCSV = (data: Transaction[], filename: string) => {
    const csv = jsonToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExcel = (data: Transaction[], filename: string) => {
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
    const allData: Transaction[] = [];
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

    console.log(exportType, 'export type is');
    if (exportFileType === 'csv') {
      downloadCSV(allData, `export_${exportType}.csv`);
    } else if (exportFileType === 'excel') {
      downloadExcel(allData, `export_${exportType}.xlsx`);
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
    .from('wallet_transactions')
    .select(
      '*, workspace_wallets!inner(name, ws_id), transaction_categories(name)',
      {
        count: 'exact',
      }
    )
    .eq('workspace_wallets.ws_id', wsId)
    .order('taken_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const parsedPage = parseInt(page);
  const parsedSize = parseInt(pageSize);
  const start = (parsedPage - 1) * parsedSize;
  const end = parsedPage * parsedSize;

  queryBuilder.range(start, end).limit(parsedSize);

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData.map(
    ({ workspace_wallets, transaction_categories, ...rest }) => ({
      ...rest,
      wallet: workspace_wallets?.name,
      category: transaction_categories?.name,
    })
  );

  return { data, count } as {
    data: Transaction[];
    count: number;
  };
}
