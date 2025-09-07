import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '../pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select';

interface DataPaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  showPageSizeSelector?: boolean;
  showItemCount?: boolean;
  itemName?: string;
}

export function DataPagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  showPageSizeSelector = true,
  showItemCount = true,
  itemName = 'items',
}: DataPaginationProps) {
  // Calculate display range
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  //   // If there are no items or only one page, don't show pagination
  //   if (totalCount === 0 || totalPages <= 1) {
  //     return null;
  //   }

  return (
    <div className="flex flex-col gap-4">
      {/* Page Size Selector */}
      {showPageSizeSelector && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">Show</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">per page</span>
        </div>
      )}

      {/* Pagination Controls */}
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
              className={`${currentPage <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
            />
          </PaginationItem>

          {/* First page */}
          {currentPage > 2 && (
            <>
              <PaginationItem>
                <PaginationLink
                  onClick={() => onPageChange(1)}
                  isActive={false}
                  className="cursor-pointer"
                >
                  1
                </PaginationLink>
              </PaginationItem>
              {currentPage > 3 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
            </>
          )}

          {/* Previous page */}
          {currentPage > 1 && (
            <PaginationItem>
              <PaginationLink
                onClick={() => onPageChange(currentPage - 1)}
                isActive={false}
                className="cursor-pointer"
              >
                {currentPage - 1}
              </PaginationLink>
            </PaginationItem>
          )}

          {/* Current page */}
          <PaginationItem>
            <PaginationLink isActive={true}>{currentPage}</PaginationLink>
          </PaginationItem>

          {/* Next page */}
          {currentPage < totalPages && (
            <PaginationItem>
              <PaginationLink
                onClick={() => onPageChange(currentPage + 1)}
                isActive={false}
                className="cursor-pointer"
              >
                {currentPage + 1}
              </PaginationLink>
            </PaginationItem>
          )}

          {/* Last page */}
          {currentPage < totalPages - 1 && (
            <>
              {currentPage < totalPages - 2 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              <PaginationItem>
                <PaginationLink
                  onClick={() => onPageChange(totalPages)}
                  isActive={false}
                  className="cursor-pointer"
                >
                  {totalPages}
                </PaginationLink>
              </PaginationItem>
            </>
          )}

          <PaginationItem>
            <PaginationNext
              onClick={() =>
                currentPage < totalPages && onPageChange(currentPage + 1)
              }
              className={`${currentPage >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      {/* Item Count Display */}
      {showItemCount && totalCount > 0 && (
        <div className="text-center text-muted-foreground text-sm">
          Showing {startItem} to {endItem} of {totalCount} {itemName}
        </div>
      )}
    </div>
  );
}
