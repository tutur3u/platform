'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';
import { TableCell, TableRow } from '@tuturuuu/ui/table';

export function ContactLoadingRows() {
  return Array.from({ length: 4 }, (_, index) => (
    <TableRow key={`contact-loading-${index}`}>
      <TableCell>
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-56" />
      </TableCell>
      <TableCell>
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-64" />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <Skeleton className="h-8 w-32" />
        </div>
      </TableCell>
    </TableRow>
  ));
}
