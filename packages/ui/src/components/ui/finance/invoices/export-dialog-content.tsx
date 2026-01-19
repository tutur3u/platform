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
import { useId, useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import { XLSX } from '../../../../xlsx';

// Helper function to fetch pending invoices data for export
async function getPendingInvoicesData(
  wsId: string,
  {
    page = '1',
    pageSize = '10',
    q,
    userIds,
  }: {
    page?: string;
    pageSize?: string;
    q?: string;
    userIds?: string | string[];
  }
) {
  const supabase = createClient();

  const parsedPage = parseInt(page, 10);
  const parsedSize = parseInt(pageSize, 10);
  const offset = (parsedPage - 1) * parsedSize;

  // Normalize userIds: treat empty array as no filter (undefined)
  const ids = Array.isArray(userIds)
    ? userIds.length > 0
      ? userIds
      : undefined
    : userIds
      ? [userIds]
      : undefined;

  // Fetch pending invoices data
  const { data: rawData, error } = await supabase.rpc('get_pending_invoices', {
    p_ws_id: wsId,
    p_limit: parsedSize,
    p_offset: offset,
    p_query: q || undefined,
    p_user_ids: ids,
  });

  if (error) throw error;

  // Fetch total count
  const { data: countData, error: countError } = await supabase.rpc(
    'get_pending_invoices_count',
    {
      p_ws_id: wsId,
      p_query: q || undefined,
      p_user_ids: ids,
    }
  );

  if (countError) throw countError;

  // Define the shape of raw pending invoice data from RPC
  interface PendingInvoiceRaw {
    user_id?: string | null;
    user_name?: string | null;
    user_avatar_url?: string | null;
    group_id?: string | null;
    group_name?: string | null;
    months_owed?: string | string[];
    [key: string]: unknown;
  }

  // Transform the data to match the expected format
  const data = (rawData || []).map((invoice: PendingInvoiceRaw) => {
    // Parse months_owed - handle both CSV string and array, normalize formatting
    const monthsOwed =
      typeof invoice.months_owed === 'string'
        ? invoice.months_owed
            .split(',')
            .map((m) => m.trim())
            .join(', ')
        : Array.isArray(invoice.months_owed)
          ? invoice.months_owed.join(', ')
          : '';

    return {
      ...invoice,
      months_owed: monthsOwed,
      customer: invoice.user_id
        ? {
            full_name: invoice.user_name || '',
            avatar_url: invoice.user_avatar_url || '',
          }
        : invoice.group_id
          ? {
              full_name: invoice.group_name || '',
              avatar_url: '',
            }
          : null,
      creator: null, // Pending invoices don't have creator info
      wallet: null, // Pending invoices don't have wallet info yet
    };
  });

  return { data, count: (countData as number) || 0 };
}

export default function ExportDialogContent({
  wsId,
  exportType,
  searchParams,
  invoiceType = 'created',
}: {
  wsId: string;
  exportType: string;
  searchParams: {
    q?: string;
    page?: string;
    pageSize?: string;
    userIds?: string | string[];
    walletId?: string;
    walletIds?: string | string[];
    start?: string;
    end?: string;
  };
  invoiceType?: 'created' | 'pending';
}) {
  const t = useTranslations();

  const [exportFileType, setExportFileType] = useState('excel');
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [filename, setFilename] = useState('');

  const filenameId = useId();
  const fileTypeId = useId();

  const defaultFilename = `${exportType}_${invoiceType}_export.${getFileExtension(exportFileType)}`;

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
    setProgress(0);

    const allData: any[] = [];
    let currentPage = 1;
    const pageSize = 1000;

    try {
      while (true) {
        const { data, count } =
          invoiceType === 'pending'
            ? await getPendingInvoicesData(wsId, {
                page: currentPage.toString(),
                pageSize: pageSize.toString(),
                q: searchParams.q,
                userIds: searchParams.userIds,
              })
            : await getData(wsId, {
                q: searchParams.q,
                page: currentPage.toString(),
                pageSize: pageSize.toString(),
                userIds: searchParams.userIds,
                walletId: searchParams.walletId,
                walletIds: searchParams.walletIds,
                start: searchParams.start,
                end: searchParams.end,
              });

        const flattenedData = data.map((invoice) => {
          // Destructure out complex objects to prevent [object Object] in exports
          const { customer, creator, wallet, ...rest } = invoice;

          // Only include creator & wallet fields for created invoices
          if (invoiceType === 'created') {
            return {
              ...rest,
              customer_name: customer?.full_name || '',
              customer_avatar_url: customer?.avatar_url || '',
              creator_name:
                creator?.display_name ||
                creator?.full_name ||
                creator?.email ||
                '',
              creator_email: creator?.email || '',
              wallet_name: wallet?.name || '',
            };
          }

          // For pending invoices, just return rest (user_name & user_avatar_url already included)
          return rest;
        });

        allData.push(...flattenedData);

        const totalPages = Math.max(1, Math.ceil(count / pageSize));
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
          `${(filename || defaultFilename).replace(/\.csv/g, '')}.csv`
        );
      } else if (exportFileType === 'excel') {
        downloadExcel(
          allData,
          `${(filename || defaultFilename).replace(/\.xlsx/g, '')}.xlsx`
        );
      }
    } catch (error) {
      console.error('Export failed:', error);
      // You might want to show a toast error here
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

async function getData(
  wsId: string,
  {
    // q,
    page = '1',
    pageSize = '10',
    start,
    end,
    userIds,
    walletId,
    walletIds,
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
    start?: string;
    end?: string;
    userIds?: string | string[];
    walletId?: string;
    walletIds?: string | string[];
  }
) {
  const supabase = createClient();

  // Combine walletId and walletIds
  let wallets = Array.isArray(walletIds)
    ? walletIds
    : walletIds
      ? [walletIds]
      : [];
  if (walletId) wallets.push(walletId);
  wallets = Array.from(new Set(wallets.filter(Boolean)));

  // Build select query dynamically
  let selectQuery =
    '*, customer:workspace_users!customer_id(full_name, avatar_url), legacy_creator:workspace_users!creator_id(id, full_name, display_name, email, avatar_url), platform_creator:users!platform_creator_id(id, display_name, avatar_url, user_private_details(full_name, email))';

  const walletJoinType = wallets.length > 0 ? '!inner' : '';
  selectQuery += `, wallet_transactions!finance_invoices_transaction_id_fkey${walletJoinType}(wallet:workspace_wallets(name))`;

  let queryBuilder = supabase
    .from('finance_invoices')
    .select(selectQuery, {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (start && end) {
    queryBuilder = queryBuilder.gte('created_at', start).lte('created_at', end);
  }

  if (userIds) {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (ids.length > 0) {
      queryBuilder = queryBuilder.in('creator_id', ids);
    }
  }

  if (wallets.length > 0) {
    queryBuilder = queryBuilder.in('wallet_transactions.wallet_id', wallets);
  }

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const startRange = (parsedPage - 1) * parsedSize;
    const endRange = parsedPage * parsedSize - 1;
    queryBuilder = queryBuilder.range(startRange, endRange);
  }

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData.map(
    ({
      customer,
      legacy_creator,
      platform_creator,
      wallet_transactions,
      ...rest
    }: any) => {
      const platformCreator = platform_creator as {
        id: string;
        display_name: string | null;
        avatar_url: string | null;
        user_private_details: {
          full_name: string | null;
          email: string | null;
        } | null;
      } | null;

      const legacyCreator = legacy_creator as {
        id: string;
        display_name: string | null;
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
      } | null;

      const creator = {
        id: platformCreator?.id ?? legacyCreator?.id ?? '',
        display_name:
          platformCreator?.display_name ??
          legacyCreator?.display_name ??
          platformCreator?.user_private_details?.email ??
          null,
        full_name:
          platformCreator?.user_private_details?.full_name ??
          legacyCreator?.full_name ??
          null,
        email:
          platformCreator?.user_private_details?.email ??
          legacyCreator?.email ??
          null,
        avatar_url:
          platformCreator?.avatar_url ?? legacyCreator?.avatar_url ?? null,
      };

      const wallet = wallet_transactions?.wallet
        ? { name: wallet_transactions.wallet.name }
        : null;

      return {
        ...rest,
        customer,
        creator,
        wallet,
      };
    }
  );

  return { data, count } as { data: any[]; count: number };
}
