'use client';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

export function InvoiceHistoryPagination({
  page,
  pageSize,
  hasMore,
  busy,
  failed,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  hasMore: boolean;
  busy: boolean;
  failed: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const t = useTranslations('ws-invoices');
  return (
    <nav
      aria-label={t('activity_pagination')}
      className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
    >
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <span>{t('activity_rows_per_page')}</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => {
            onPageSizeChange(Number(value));
          }}
        >
          <SelectTrigger
            className="w-20"
            aria-label={t('activity_rows_per_page')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0 || busy}
          onClick={() => onPageChange(page - 1)}
        >
          {t('activity_previous')}
        </Button>
        <span className="text-muted-foreground text-sm tabular-nums">
          {t('activity_page', { page: page + 1 })}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || failed || !hasMore}
          onClick={() => onPageChange(page + 1)}
        >
          {t('activity_next')}
        </Button>
      </div>
    </nav>
  );
}
