'use client';

import { useMutation } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText, Loader2 } from '@tuturuuu/icons';
import type {
  InventorySalesExportFormat,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import { exportInventorySales } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function SalesExportDropdown({
  canExport,
  period,
  wsId,
}: {
  canExport: boolean;
  period?: InventorySalesPeriod;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.export');
  const exportMutation = useMutation({
    mutationFn: (format: InventorySalesExportFormat) => {
      if (!period) throw new Error('A named sales period is required');
      return exportInventorySales(wsId, {
        format,
        period_id: period.id,
      });
    },
    onError: () => toast.error(t('error')),
    onSuccess: ({ blob, filename }) => {
      downloadBlob(blob, filename);
      toast.success(t('success'));
    },
  });

  if (!canExport) return null;

  const disabled = !period || exportMutation.isPending;
  const exportFormat = (format: InventorySalesExportFormat) => {
    exportMutation.mutate(format);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={period ? t('button') : t('namedPeriodRequired')}
          className="h-9 shrink-0 touch-manipulation sm:h-8"
          disabled={disabled}
          size="sm"
          title={period ? t('description') : t('namedPeriodRequired')}
          type="button"
          variant="outline"
        >
          {exportMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {exportMutation.isPending ? t('exporting') : t('button')}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t('chooseFormat')}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => exportFormat('csv')}>
          <FileText className="h-4 w-4" />
          <span className="grid">
            <span>{t('csv')}</span>
            <span className="text-muted-foreground text-xs">
              {t('csvDescription')}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportFormat('xlsx')}>
          <FileSpreadsheet className="h-4 w-4" />
          <span className="grid">
            <span>{t('excel')}</span>
            <span className="text-muted-foreground text-xs">
              {t('excelDescription')}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
