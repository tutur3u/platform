'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import { DataPagination } from '../../custom/data-pagination';

interface MeetTogetherPaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

export default function MeetTogetherPagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
}: MeetTogetherPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const createURL = useCallback(
    (params: Record<string, string>) => {
      const newSearchParams = new URLSearchParams(searchParams.toString());

      // Update the specified parameters
      Object.entries(params).forEach(([key, value]) => {
        if (value) {
          newSearchParams.set(key, value);
        } else {
          newSearchParams.delete(key);
        }
      });

      return `${pathname}?${newSearchParams.toString()}`;
    },
    [pathname, searchParams]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      if (page === currentPage) return;

      startTransition(() => {
        const url = createURL({ page: page.toString() });
        router.push(url);
      });
    },
    [router, currentPage, createURL]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      if (newPageSize === pageSize) return;

      startTransition(() => {
        const url = createURL({
          pageSize: newPageSize.toString(),
          page: '1', // Reset to first page when changing page size
        });
        router.push(url);
      });
    },
    [router, pageSize, createURL]
  );

  const pageSizeOptions = [6, 9, 12, 18, 24];

  return (
    <div style={{ opacity: isPending ? 0.7 : 1 }}>
      <DataPagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        itemName="plans"
        pageSizeOptions={pageSizeOptions}
        showPageSizeSelector={totalCount > 6}
      />
    </div>
  );
}
