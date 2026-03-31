'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/types/primitives/Product';
import { Button } from '@tuturuuu/ui/button';
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { formatCurrency } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import { fetchWorkspaceProducts, type ProductStatusFilter } from './hooks';

interface ProductsExportDialogContentProps {
  categoryId?: string;
  currency: string;
  q?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status: ProductStatusFilter;
  wsId: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function getStockSummary(product: Product, unlimitedLabel: string) {
  if (!product.stock?.length) {
    return '';
  }

  return product.stock
    .map((entry) => {
      const warehouse = entry.warehouse || '-';
      const unit = entry.unit ? ` ${entry.unit}` : '';
      const amount =
        entry.amount === null
          ? unlimitedLabel
          : `${entry.amount ?? '-'}${unit}`;

      return `${warehouse}: ${amount}`;
    })
    .join(' | ');
}

function getPriceSummary(product: Product, currency: string) {
  if (!product.stock?.length) {
    return '';
  }

  return product.stock
    .map((entry) => {
      const warehouse = entry.warehouse || '-';
      const price =
        entry.price == null ? '-' : formatCurrency(entry.price, currency);

      return `${warehouse}: ${price}`;
    })
    .join(' | ');
}

export function ProductsExportDialogContent({
  categoryId,
  currency,
  q,
  sortBy,
  sortOrder,
  status,
  wsId,
}: ProductsExportDialogContentProps) {
  const t = useTranslations();
  const [isExporting, setIsExporting] = useState(false);

  const exportProducts = async (format: 'csv' | 'excel') => {
    setIsExporting(true);

    try {
      const pageSize = 100;
      let nextPage = 1;
      let total = Number.POSITIVE_INFINITY;
      const products: Product[] = [];

      while (products.length < total) {
        const response = await fetchWorkspaceProducts(wsId, {
          categoryId,
          q,
          page: nextPage,
          pageSize,
          status,
          sortBy,
          sortOrder,
        });

        products.push(...response.data);
        total = response.count;

        if (response.data.length < pageSize) {
          break;
        }

        nextPage += 1;
      }

      const exportRows = products.map((product) => ({
        [t('product-data-table.name')]: product.name || '',
        [t('product-data-table.category')]: product.category || '',
        [t('product-data-table.status')]: product.archived
          ? t('common.archived')
          : t('common.active'),
        [t('product-data-table.manufacturer')]: product.manufacturer || '',
        [t('product-data-table.description')]: product.description || '',
        [t('product-data-table.usage')]: product.usage || '',
        [t('product-data-table.stock')]: getStockSummary(
          product,
          t('product-data-table.unlimited_stock')
        ),
        [t('product-data-table.price')]: getPriceSummary(product, currency),
        [t('product-data-table.created_at')]: product.created_at || '',
      }));

      const fileStem = `products-${new Date().toISOString().slice(0, 10)}`;

      if (format === 'csv') {
        const csv = jsonToCSV(exportRows);
        downloadBlob(
          new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
          `${fileStem}.csv`
        );
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
      const excelBuffer = XLSX.write(workbook, {
        bookType: 'xlsx',
        type: 'array',
      });
      downloadBlob(
        new Blob([excelBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `${fileStem}.xlsx`
      );
    } catch (_error) {
      toast.error(t('ws-inventory-products.export.failed'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t('ws-inventory-products.export.title')}</DialogTitle>
        <DialogDescription>
          {t('ws-inventory-products.export.description')}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void exportProducts('csv')}
          disabled={isExporting}
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('ws-inventory-products.export.csv')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void exportProducts('excel')}
          disabled={isExporting}
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('ws-inventory-products.export.excel')}
        </Button>
      </div>
    </div>
  );
}
