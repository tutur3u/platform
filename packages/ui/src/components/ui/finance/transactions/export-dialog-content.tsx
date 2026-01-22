'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
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
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useId, useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import { XLSX } from '../../../../xlsx';

type TransactionExportRow = {
  amount: number | null;
  description: string | null;
  category: string | null;
  transaction_type: 'expense' | 'income' | null;
  wallet: string | null;
  taken_at: string | null;
  created_at: string | null;
  report_opt_in: boolean | null;
  creator_name: string | null;
  creator_email: string | null;
  invoice_for_name: string | null;
  invoice_for_email: string | null;
};

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
      const progressValue = (currentPage / totalPages) * 100;
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

type ExportTransactionCreator = {
  display_name: string | null;
  full_name: string | null;
  email: string | null;
};

type ExportWorkspaceWallet = {
  name: string | null;
  ws_id: string | null;
};

type ExportTransactionCategory = {
  name: string | null;
  is_expense: boolean | null;
};

type ExportWorkspaceUser = {
  display_name: string | null;
  full_name: string | null;
  email: string | null;
};

type ExportFinanceInvoice = {
  customer_id: string | null;
  workspace_users: ExportWorkspaceUser | ExportWorkspaceUser[] | null;
};

type ExportWalletTransactionRow = {
  amount: number | null;
  description: string | null;
  taken_at: string | null;
  created_at: string | null;
  report_opt_in: boolean | null;
  workspace_wallets: ExportWorkspaceWallet | ExportWorkspaceWallet[] | null;
  transaction_categories:
    | ExportTransactionCategory
    | ExportTransactionCategory[]
    | null;
  distinct_transaction_creators:
    | ExportTransactionCreator
    | ExportTransactionCreator[]
    | null;
  finance_invoices: ExportFinanceInvoice | ExportFinanceInvoice[] | null;
};

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    userIds,
    categoryIds,
    walletIds,
    start,
    end,
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
    userIds?: string | string[];
    categoryIds?: string | string[];
    walletIds?: string | string[];
    start?: string;
    end?: string;
  }
) {
  const supabase = createClient();

  let queryBuilder = supabase
    .from('wallet_transactions')
    .select(
      [
        'amount',
        'description',
        'taken_at',
        'created_at',
        'report_opt_in',
        'workspace_wallets!inner(name, ws_id)',
        'transaction_categories(name, is_expense)',
        'distinct_transaction_creators(display_name, full_name, email)',
        'finance_invoices!wallet_transactions_invoice_id_fkey(customer_id, workspace_users!finance_invoices_customer_id_fkey(display_name, full_name, email))',
      ].join(','),
      {
        count: 'exact',
      }
    )
    .eq('workspace_wallets.ws_id', wsId)
    .order('taken_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (q) queryBuilder = queryBuilder.ilike('description', `%${q}%`);

  // Filter by user IDs if provided
  if (userIds) {
    const userIdArray = Array.isArray(userIds) ? userIds : [userIds];
    if (userIdArray.length > 0) {
      queryBuilder = queryBuilder.in('creator_id', userIdArray);
    }
  }

  // Filter by category IDs if provided
  if (categoryIds) {
    const categoryIdArray = Array.isArray(categoryIds)
      ? categoryIds
      : [categoryIds];
    if (categoryIdArray.length > 0) {
      queryBuilder = queryBuilder.in('category_id', categoryIdArray);
    }
  }

  // Filter by wallet IDs if provided
  if (walletIds) {
    const walletIdArray = Array.isArray(walletIds) ? walletIds : [walletIds];
    if (walletIdArray.length > 0) {
      queryBuilder = queryBuilder.in('wallet_id', walletIdArray);
    }
  }

  // Filter by date range if provided
  if (start && end) {
    queryBuilder = queryBuilder.gte('taken_at', start).lte('taken_at', end);
  }

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const startOffset = (parsedPage - 1) * parsedSize;
    const endOffset = parsedPage * parsedSize - 1;
    queryBuilder = queryBuilder.range(startOffset, endOffset);
  }

  // The select string includes nested relationships and explicit foreign keys.
  // Supabase's type-level select parser can produce a `GenericStringError` when
  // it can't fully validate the query. We override the return type here to keep
  // the export logic type-safe at the usage boundary.
  const {
    data: rawData,
    error,
    count,
  } = await queryBuilder.returns<ExportWalletTransactionRow[]>();
  if (error) throw error;

  const data = (rawData ?? []).map((row) => {
    const creator = Array.isArray(row.distinct_transaction_creators)
      ? (row.distinct_transaction_creators[0] ?? null)
      : row.distinct_transaction_creators;

    const invoice = Array.isArray(row.finance_invoices)
      ? (row.finance_invoices[0] ?? null)
      : row.finance_invoices;

    const invoiceCustomer = invoice
      ? Array.isArray(invoice.workspace_users)
        ? (invoice.workspace_users[0] ?? null)
        : invoice.workspace_users
      : null;

    const category = Array.isArray(row.transaction_categories)
      ? (row.transaction_categories[0] ?? null)
      : row.transaction_categories;

    const wallet = Array.isArray(row.workspace_wallets)
      ? (row.workspace_wallets[0] ?? null)
      : row.workspace_wallets;

    const creatorName = creator?.display_name || creator?.full_name || null;
    const invoiceForName =
      invoiceCustomer?.display_name || invoiceCustomer?.full_name || null;
    const transactionType =
      category?.is_expense === true
        ? 'expense'
        : category?.is_expense === false
          ? 'income'
          : null;

    return {
      amount: row.amount ?? null,
      description: row.description ?? null,
      category: category?.name ?? null,
      transaction_type: transactionType,
      wallet: wallet?.name ?? null,
      taken_at: row.taken_at ?? null,
      created_at: row.created_at ?? null,
      report_opt_in: row.report_opt_in ?? null,
      creator_name: creatorName,
      creator_email: creator?.email ?? null,
      invoice_for_name: invoiceForName,
      invoice_for_email: invoiceCustomer?.email ?? null,
    };
  });

  return { data, count } as {
    data: TransactionExportRow[];
    count: number;
  };
}
