'use client';

import { DataPagination } from '@tuturuuu/ui/custom/data-pagination';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface CertificatePaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  wsId: string;
}

export function CertificatePagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  wsId,
}: CertificatePaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handlePageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', page.toString());
      router.push(`/${wsId}/certificate?${params.toString()}`);
    },
    [router, searchParams, wsId]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('pageSize', newPageSize.toString());
      params.set('page', '1'); // Reset to first page when changing page size
      router.push(`/${wsId}/certificate?${params.toString()}`);
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
      itemName="certificates"
      pageSizeOptions={[6, 12, 24, 48]}
    />
  );
}
