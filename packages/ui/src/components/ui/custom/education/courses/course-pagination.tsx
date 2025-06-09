'use client';

import { DataPagination } from '@tuturuuu/ui/custom/data-pagination';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface CoursePaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  wsId: string;
}

export function CoursePagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  wsId,
}: CoursePaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handlePageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', page.toString());
      router.push(`/${wsId}/courses?${params.toString()}`);
    },
    [router, searchParams, wsId]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('pageSize', newPageSize.toString());
      params.set('page', '1'); // Reset to first page when changing page size
      router.push(`/${wsId}/courses?${params.toString()}`);
    },
    [router, searchParams, wsId]
  );

  return (
    <DataPagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalCount={totalCount}
      pageSize={pageSize}
      onPageChange={handlePageChange}
      onPageSizeChange={handlePageSizeChange}
      itemName="courses"
      pageSizeOptions={[5, 10, 20, 50]}
    />
  );
}
