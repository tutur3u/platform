'use client';

import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useRouter, useSearchParams } from 'next/navigation';

interface Props {
  currentPage: number;
  pageSize: number;
  totalCount: number;
}

export default function SyncLogsPagination({
  currentPage,
  pageSize,
  totalCount,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  const updateParams = (page: number, newPageSize?: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    if (newPageSize) {
      params.set('pageSize', newPageSize.toString());
    }
    router.push(`?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      updateParams(newPage);
    }
  };

  const handlePageSizeChange = (newSize: string) => {
    updateParams(1, Number(newSize));
  };

  // Don't show pagination if no data
  if (totalCount === 0) {
    return (
      <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
        No sync logs found
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-between gap-4 rounded-lg border-2 border-border bg-background/50 p-4 shadow-sm sm:flex-row">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-foreground">
          Showing {startIndex}-{endIndex} of {totalCount} results
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground text-sm">Show:</span>
          <Select
            value={pageSize.toString()}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="h-9 w-20 border-2 font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-9 border-2 px-3 font-medium"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>

          <div className="flex items-center gap-2 rounded-md border-2 border-border bg-muted px-4 py-2">
            <span className="font-bold text-foreground text-sm">
              Page {currentPage} / {totalPages}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="h-9 border-2 px-3 font-medium"
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
