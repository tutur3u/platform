'use client';

import { Button } from '@tuturuuu/ui/button';
import { ChevronLeft, ChevronRight, X } from '@tuturuuu/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';

interface GanttControlsProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  currentPage: number;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
  totalTasks: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
}

export function GanttControls({
  searchQuery,
  setSearchQuery,
  pageSize,
  setPageSize,
  currentPage,
  setCurrentPage,
  totalTasks,
  totalPages,
  startIndex,
  endIndex,
}: GanttControlsProps) {
  return (
    <div className="mb-4 flex flex-col items-center justify-between gap-4 md:flex-row">
      {/* Search Input */}
      <div className="relative w-full md:max-w-sm">
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none dark:border-gray-700"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Pagination and Task Count */}
      <div className="flex flex-wrap items-center justify-center gap-4 md:justify-end">
        <Select
          value={pageSize.toString()}
          onValueChange={(value) => {
            setPageSize(Number(value));
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5</SelectItem>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
          </SelectContent>
        </Select>

        {totalTasks > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Showing {startIndex + 1}-{Math.min(endIndex, totalTasks)} of{' '}
              {totalTasks} tasks
            </span>

            {totalPages > 1 && (
              <div className="ml-4 flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={currentPage === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <span className="px-2 text-sm">
                  {currentPage} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 