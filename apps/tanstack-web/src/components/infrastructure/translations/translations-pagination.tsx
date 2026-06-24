import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

type TranslationsPaginationProps = {
  count: number;
  labels: {
    next: string;
    previous: string;
    showing: string;
  };
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
};

export function TranslationsPagination({
  count,
  labels,
  onPageChange,
  page,
  total,
  totalPages,
}: TranslationsPaginationProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">{labels.showing}</p>
      <div className="flex items-center gap-2">
        <Button
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          size="sm"
          variant="outline"
        >
          <ChevronLeft className="h-4 w-4" />
          {labels.previous}
        </Button>
        <span className="min-w-20 text-center text-muted-foreground text-sm">
          {page} / {totalPages}
        </span>
        <Button
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          size="sm"
          variant="outline"
        >
          {labels.next}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <span className="sr-only">
        {count} / {total}
      </span>
    </div>
  );
}
