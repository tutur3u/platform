'use client';

import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { useState } from 'react';
import { Button } from '../button';
import { Input } from '../input';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '../pagination';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
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
                  <PageJumpPopover
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                  />
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

          {/* Current page - with popover */}
          <PaginationItem>
            <CurrentPagePopover
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
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
                  <PageJumpPopover
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                  />
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

// ============================================================================
// Page Jump Popover (for ellipsis)
// ============================================================================

interface PageJumpPopoverProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function PageJumpPopover({
  currentPage,
  totalPages,
  onPageChange,
}: PageJumpPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleGoToPage = () => {
    const pageNum = parseInt(inputValue, 10);
    if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      setIsOpen(false);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGoToPage();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="cursor-pointer">
          <PaginationEllipsis />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="center" sideOffset={8}>
        <div className="space-y-3">
          <p className="text-center text-muted-foreground text-xs">
            Go to page
          </p>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => {
                  const current = parseInt(inputValue, 10) || 2;
                  if (current > 1) {
                    setInputValue(String(current - 1));
                  }
                }}
                className="flex h-8 w-9 items-center justify-center rounded-l-md border border-r-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={inputValue}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setInputValue(val);
                }}
                onKeyDown={handleKeyDown}
                placeholder={`1-${totalPages}`}
                className="h-8 rounded-none border-x-0 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  const current = parseInt(inputValue, 10) || 0;
                  if (current < totalPages) {
                    setInputValue(String(current + 1));
                  }
                }}
                className="flex h-8 w-9 items-center justify-center rounded-r-md border border-l-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button
              size="sm"
              onClick={handleGoToPage}
              disabled={
                !inputValue ||
                parseInt(inputValue, 10) < 1 ||
                parseInt(inputValue, 10) > totalPages
              }
              className="h-8 px-3"
            >
              Go
            </Button>
          </div>
          {/* Quick page buttons */}
          <div className="flex flex-wrap justify-center gap-1">
            {[1, Math.ceil(totalPages / 2), totalPages]
              .filter((v, i, a) => a.indexOf(v) === i)
              .map((pageNum) => (
                <button
                  type="button"
                  key={pageNum}
                  onClick={() => {
                    onPageChange(pageNum);
                    setIsOpen(false);
                  }}
                  className={`rounded px-2 py-0.5 text-xs transition-colors ${
                    currentPage === pageNum
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Current Page Popover
// ============================================================================

function CurrentPagePopover({
  currentPage,
  totalPages,
  onPageChange,
}: PageJumpPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  // Don't show popover if only one page
  if (totalPages <= 1) {
    return <PaginationLink isActive={true}>{currentPage}</PaginationLink>;
  }

  const handleGoToPage = () => {
    const pageNum = parseInt(inputValue, 10);
    if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      setIsOpen(false);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGoToPage();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button type="button">
          <PaginationLink isActive={true} className="cursor-pointer">
            {currentPage}
          </PaginationLink>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="center" sideOffset={8}>
        <div className="space-y-3">
          <p className="text-center text-muted-foreground text-xs">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => {
                  const current = parseInt(inputValue, 10) || 2;
                  if (current > 1) {
                    setInputValue(String(current - 1));
                  }
                }}
                className="flex h-8 w-9 items-center justify-center rounded-l-md border border-r-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={inputValue}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setInputValue(val);
                }}
                onKeyDown={handleKeyDown}
                placeholder={`1-${totalPages}`}
                className="h-8 rounded-none border-x-0 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  const current = parseInt(inputValue, 10) || 0;
                  if (current < totalPages) {
                    setInputValue(String(current + 1));
                  }
                }}
                className="flex h-8 w-9 items-center justify-center rounded-r-md border border-l-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button
              size="sm"
              onClick={handleGoToPage}
              disabled={
                !inputValue ||
                parseInt(inputValue, 10) < 1 ||
                parseInt(inputValue, 10) > totalPages
              }
              className="h-8 px-3"
            >
              Go
            </Button>
          </div>
          {/* Quick page buttons */}
          <div className="flex flex-wrap justify-center gap-1">
            {[1, Math.ceil(totalPages / 2), totalPages]
              .filter((v, i, a) => a.indexOf(v) === i)
              .map((pageNum) => (
                <button
                  type="button"
                  key={pageNum}
                  onClick={() => {
                    onPageChange(pageNum);
                    setIsOpen(false);
                  }}
                  className={`rounded px-2 py-0.5 text-xs transition-colors ${
                    currentPage === pageNum
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
