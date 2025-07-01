'use client';

import { DataPagination } from '@tuturuuu/ui/custom/data-pagination';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface CoursePaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  wsId?: string;
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

      const route = wsId ? `/${wsId}/courses` : '/courses';
      router.push(`${route}?${params.toString()}`);
    },
    [router, searchParams, wsId]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('pageSize', newPageSize.toString());
      params.set('page', '1');

      const route = wsId ? `/${wsId}/courses` : '/courses';
      router.push(`${route}?${params.toString()}`);
    },
    [router, searchParams, wsId]
  );

  const pageSizeOptions = wsId ? [5, 10, 20, 50] : [6, 12, 24, 48];

  return (
    <DataPagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalCount={totalCount}
      pageSize={pageSize}
      onPageChange={handlePageChange}
      onPageSizeChange={handlePageSizeChange}
      itemName="courses"
      pageSizeOptions={pageSizeOptions}
    />
  );
}
