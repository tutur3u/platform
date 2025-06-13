'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useRouter, useSearchParams } from 'next/navigation';

interface StatusFilterProps {
  currentStatus?: string;
}

export function StatusFilter({ currentStatus }: StatusFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(searchParams);

    if (status === 'all') {
      params.delete('status');
    } else {
      params.set('status', status);
    }

    // Reset to first page when filtering
    params.delete('page');

    router.push(`?${params.toString()}`);
  };

  return (
    <Select value={currentStatus || 'all'} onValueChange={handleStatusChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Filter by status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Requests</SelectItem>
        <SelectItem value="pending">Pending</SelectItem>
        <SelectItem value="approved">Approved</SelectItem>
        <SelectItem value="rejected">Rejected</SelectItem>
      </SelectContent>
    </Select>
  );
}
