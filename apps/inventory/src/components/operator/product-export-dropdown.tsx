'use client';

import { useMutation } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText, Loader2 } from '@tuturuuu/icons';
import { listInventoryProducts } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { useTranslations } from 'next-intl';
import type { InventoryFilters } from './operator-types';
import {
  buildProductExportRows,
  loadProductsForExport,
  localizeProductExportRows,
  serializeProductExportCsv,
} from './product-export';
import { useWorkspaceCurrency } from './workspace-currency';

type ProductExportFormat = 'csv' | 'xlsx';

export function ProductExportDropdown({
  filters,
  showLabel,
  wsId,
}: {
  filters: InventoryFilters;
  showLabel: boolean;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.productExport');
  const currency = useWorkspaceCurrency();
  const exportMutation = useMutation({
    mutationFn: async (format: ProductExportFormat) => {
      const filteredProducts = await loadProductsForExport({
        filters,
        listProducts: listInventoryProducts,
        wsId,
      });
      const rows = buildProductExportRows(filteredProducts, {
        activeLabel: t('active'),
        archivedLabel: t('archived'),
        currency,
        unlimitedLabel: t('unlimited'),
      });
      const localizedRows = localizeProductExportRows(rows, {
        category: t('columns.category'),
        description: t('columns.description'),
        manufacturer: t('columns.manufacturer'),
        name: t('columns.name'),
        owner: t('columns.owner'),
        price: t('columns.price'),
        status: t('columns.status'),
        stock: t('columns.stock'),
        usage: t('columns.usage'),
      });
      const fileStem = `products-${new Date().toISOString().slice(0, 10)}`;

      if (format === 'csv') {
        downloadBlob(
          new Blob([serializeProductExportCsv(localizedRows)], {
            type: 'text/csv;charset=utf-8;',
          }),
          `${fileStem}.csv`
        );
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(localizedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, t('sheet'));
      downloadBlob(
        new Blob([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `${fileStem}.xlsx`
      );
    },
    onError: () => toast.error(t('error')),
    onSuccess: () => toast.success(t('success')),
  });

  const label = exportMutation.isPending ? t('exporting') : t('button');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className="min-h-10 w-full shrink-0 touch-manipulation sm:min-h-9 sm:w-auto"
          disabled={exportMutation.isPending}
          type="button"
          variant="outline"
        >
          {exportMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {showLabel ? <span>{label}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t('chooseFormat')}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => exportMutation.mutate('csv')}>
          <FileText className="h-4 w-4" />
          <span className="grid">
            <span>{t('csv')}</span>
            <span className="text-muted-foreground text-xs">
              {t('csvDescription')}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportMutation.mutate('xlsx')}>
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
