'use client';

import {
  listFinanceInvoices,
  listPendingFinanceInvoices,
} from '@tuturuuu/internal-api/finance';
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
import { useId, useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import { useWorkspaceConfig } from '../../../../hooks/use-workspace-config';
import { XLSX } from '../../../../xlsx';

/**
 * Shape of invoice data as exported to CSV/Excel
 * Flattened structure with complex objects decomposed into primitive fields
 */
interface InvoiceExportRow {
  // Common fields
  id: string;
  ws_id: string;
  created_at: string;
  notice?: string;
  note?: string;
  price?: number | string;
  total_diff?: number | string;

  // Flattened customer fields
  customer_name?: string;
  customer_avatar_url?: string;

  // Flattened creator fields (created invoices only)
  creator_name?: string;
  creator_email?: string;
  creator_id?: string;

  // Flattened wallet fields (created invoices only)
  wallet_name?: string;

  // Pending invoice specific fields
  user_id?: string;
  user_name?: string;
  user_avatar_url?: string;
  group_id?: string;
  group_name?: string;
  months_owed?: string;
  attendance_days?: number;
  total_sessions?: number;
  potential_total?: number | string;
}

type PendingInvoiceExportData = {
  attendance_days: number;
  group_id: string;
  group_name: string;
  months_owed: string;
  potential_total: number;
  total_sessions: number;
  user_avatar_url: string;
  user_id: string;
  user_name: string;
  customer: {
    full_name: string;
    avatar_url: string;
  } | null;
  creator: null;
  wallet: null;
};

type CreatedInvoiceExportData = InvoiceExportRow & {
  customer?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
  creator?: {
    display_name?: string | null;
    full_name?: string | null;
    email?: string | null;
  } | null;
  wallet?: {
    name?: string | null;
  } | null;
};

type PendingInvoiceApiRow = Omit<
  PendingInvoiceExportData,
  'creator' | 'customer' | 'group_id' | 'group_name' | 'months_owed' | 'wallet'
> & {
  group_id?: string | null;
  group_ids?: string[] | null;
  group_name?: string | null;
  group_names?: string[] | null;
  months_owed?: string | string[] | null;
};

function normalizeQueryArray(value?: string | string[]) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

// Helper function to fetch pending invoices data for export
async function getPendingInvoicesData(
  wsId: string,
  {
    page = '1',
    pageSize = '10',
    q,
    userIds,
    groupByUser = false,
  }: {
    page?: string;
    pageSize?: string;
    q?: string;
    userIds?: string | string[];
    groupByUser?: boolean;
  }
): Promise<{ data: PendingInvoiceExportData[]; count: number }> {
  const payload = await listPendingFinanceInvoices(wsId, {
    groupByUser,
    page,
    pageSize,
    q: q || '',
    userIds: normalizeQueryArray(userIds),
  });

  const rawData = (payload.data || []) as PendingInvoiceApiRow[];
  const totalCount = payload.count || 0;

  const transformedData = rawData.map((invoice): PendingInvoiceExportData => {
    const monthsOwed = Array.isArray(invoice.months_owed)
      ? invoice.months_owed.join(', ')
      : typeof invoice.months_owed === 'string'
        ? invoice.months_owed
        : '';

    const baseInvoice = {
      ...invoice,
      attendance_days: invoice.attendance_days ?? 0,
      months_owed: monthsOwed,
      potential_total: invoice.potential_total ?? 0,
      total_sessions: invoice.total_sessions ?? 0,
      user_avatar_url: invoice.user_avatar_url || '',
      user_id: invoice.user_id || '',
      user_name: invoice.user_name || '',
    };

    if (groupByUser) {
      const groupNames = Array.isArray(invoice.group_names)
        ? invoice.group_names.filter(Boolean)
        : [];
      const groupedName = groupNames.join(', ');
      const groupIdValue = Array.isArray(invoice.group_ids)
        ? invoice.group_ids.join(',')
        : '';

      return {
        ...baseInvoice,
        group_id: groupIdValue,
        group_name: groupedName,
        customer: {
          full_name: invoice.user_name || '',
          avatar_url: invoice.user_avatar_url || '',
        },
        creator: null,
        wallet: null,
      };
    }

    return {
      ...baseInvoice,
      group_id: invoice.group_id || '',
      group_name: invoice.group_name || '',
      customer: invoice.user_id
        ? {
            full_name: invoice.user_name || '',
            avatar_url: invoice.user_avatar_url || '',
          }
        : {
            full_name: invoice.group_name || '',
            avatar_url: '',
          },
      creator: null,
      wallet: null,
    };
  });

  return { data: transformedData, count: totalCount };
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
  const [exportError, setExportError] = useState<string | null>(null);

  const filenameId = useId();
  const fileTypeId = useId();

  const { data: groupByUserConfig, isLoading: groupingLoading } =
    useWorkspaceConfig<string>(
      wsId,
      'INVOICE_GROUP_PENDING_INVOICES_BY_USER',
      'false'
    );

  const groupByUser = groupByUserConfig === 'true';

  const defaultFilename = `${exportType}_${invoiceType}_export.${getFileExtension(exportFileType)}`;

  const downloadCSV = (data: InvoiceExportRow[], filename: string) => {
    const csv = jsonToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExcel = (data: InvoiceExportRow[], filename: string) => {
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

    const allData: InvoiceExportRow[] = [];
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
                groupByUser,
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

        const flattenedData: InvoiceExportRow[] = data.map((invoice) => {
          // Destructure out complex objects to prevent [object Object] in exports
          const { customer, creator, wallet, ...rest } =
            invoice as CreatedInvoiceExportData;

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
            } as InvoiceExportRow;
          }

          // For pending invoices, just return rest (user_name & user_avatar_url already included)
          return rest as unknown as InvoiceExportRow;
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

      toast.success(t('common.export-success'));
    } catch {
      const errorMessage = t('common.export-error');
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
              <SelectValue placeholder={t('common.file-type')} />
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
        <Button
          onClick={handleExport}
          disabled={isExporting || groupingLoading}
        >
          {isExporting ? t('common.loading') : t('common.export')}
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
  const walletFilterIds = [
    ...(walletId ? [walletId] : []),
    ...normalizeQueryArray(walletIds),
  ];

  return (await listFinanceInvoices(wsId, {
    end,
    page,
    pageSize,
    q,
    start,
    userIds: normalizeQueryArray(userIds),
    walletIds: walletFilterIds,
  })) as {
    data: CreatedInvoiceExportData[];
    count: number;
  };
}
