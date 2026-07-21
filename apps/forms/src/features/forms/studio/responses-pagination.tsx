'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';

export function ResponsesPagination({
  currentPage,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  isRefreshing,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  isRefreshing: boolean;
  onPageChange: (page: number) => void;
}) {
  const tCommon = useTranslations('common');

  return (
    <Card className="border-border/60 bg-card/80 shadow-sm">
      <CardContent className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-sm">
            {tCommon('page')} {currentPage} / {totalPages}
          </p>
          <p className="text-muted-foreground text-sm">
            {rangeStart}-{rangeEnd} / {total}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={isRefreshing || currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            {tCommon('previous')}
          </Button>
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {currentPage}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={isRefreshing || currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            {tCommon('next')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
