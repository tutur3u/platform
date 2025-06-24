'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';

interface StatusFilterProps {
  currentStatus?: string;
}

export function StatusFilter({ currentStatus }: StatusFilterProps) {
  const t = useTranslations('approval-data-table');
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
        <SelectValue placeholder={t('filter-by-status')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t('all-requests')}</SelectItem>
        <SelectItem value="pending">{t('pending')}</SelectItem>
        <SelectItem value="approved">{t('approved')}</SelectItem>
        <SelectItem value="rejected">{t('rejected')}</SelectItem>
      </SelectContent>
    </Select>
  );
}
