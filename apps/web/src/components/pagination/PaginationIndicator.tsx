'use client';

import { Pagination } from '@mantine/core';

interface Props {
  totalItems: number | null;
}

export default function PaginationIndicator({ totalItems }: Props) {
  const activePage = 1;
  const itemsPerPage = 15;

  const totalPages = Math.ceil((totalItems || 0) / itemsPerPage);

  return (
    <div className="flex flex-col items-center justify-between gap-2 py-4 text-center md:flex-row">
      <div className="text-foreground/80 py-1">{totalItems}</div>

      <Pagination value={activePage} total={totalPages} />
    </div>
  );
}
