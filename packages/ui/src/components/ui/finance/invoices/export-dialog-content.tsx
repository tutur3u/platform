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
import { useId, useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import { useWorkspaceConfig } from '../../../../hooks/use-workspace-config';
import { XLSX } from '../../../../xlsx';
import {
  type CreatedInvoiceExportData,
  getData,
  getPendingInvoicesData,
  type InvoiceExportRow,
} from './export-data';
import {
  collectInvoiceExport,
  IncompleteInvoiceExportError,
} from './export-pagination';

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

  const {
    data: groupByUserConfig,
    isLoading: groupingLoading,
    isError: groupingError,
    refetch: retryGrouping,
  } = useWorkspaceConfig<string>(
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
    if (
      isExporting ||
      (invoiceType === 'pending' && (groupingLoading || groupingError))
    )
      return;
    setIsExporting(true);
    setProgress(0);
    setExportError(null);

    try {
      const data = await collectInvoiceExport<CreatedInvoiceExportData>({
        onProgress: setProgress,
        getKey: (row) => {
          if (invoiceType === 'created') return row.id;
          if (!row.user_id || (!groupByUser && !row.group_id)) return '';
          return groupByUser
            ? row.user_id
            : JSON.stringify([row.user_id, row.group_id]);
        },
        fetchPage: async (currentPage, pageSize) => {
          const result =
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

          return result as { data: CreatedInvoiceExportData[]; count: number };
        },
      });
      const allData: InvoiceExportRow[] = data.map((invoice) => {
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
    } catch (error) {
      const errorMessage = t(
        error instanceof IncompleteInvoiceExportError
          ? 'ws-invoices.export_incomplete'
          : 'common.export-error'
      );
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
        {invoiceType === 'pending' && (
          <p className="text-muted-foreground text-sm">
            {t('ws-invoices.export_pending_scope')}
          </p>
        )}
        {invoiceType === 'pending' && groupingError && (
          <div role="alert">
            <p>{t('ws-invoices.error_loading')}</p>
            <Button variant="outline" onClick={() => retryGrouping()}>
              {t('common.retry')}
            </Button>
          </div>
        )}
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
          <div
            role="alert"
            className="mt-2 rounded-md bg-destructive/10 p-3 text-destructive text-sm"
          >
            {exportError}
          </div>
        )}
      </div>

      <DialogFooter className="justify-between">
        <DialogClose asChild>
          <Button type="button" variant="secondary" disabled={isExporting}>
            {t('common.cancel')}
          </Button>
        </DialogClose>
        <Button
          onClick={handleExport}
          disabled={
            isExporting ||
            (invoiceType === 'pending' && (groupingLoading || groupingError))
          }
        >
          {isExporting ? t('common.loading') : t('common.export')}
        </Button>
      </DialogFooter>
    </>
  );
}
