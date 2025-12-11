'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

export default function Filters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('email-audit-data-table');

  const status = searchParams.get('status') || '';

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1'); // Reset to first page on filter change
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex gap-2">
      <Select
        value={status || 'all'}
        onValueChange={(value) => updateFilter('status', value)}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder={t('filter_by_status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all_statuses')}</SelectItem>
          <SelectItem value="pending">{t('status_pending')}</SelectItem>
          <SelectItem value="sent">{t('status_sent')}</SelectItem>
          <SelectItem value="failed">{t('status_failed')}</SelectItem>
          <SelectItem value="bounced">{t('status_bounced')}</SelectItem>
          <SelectItem value="complained">{t('status_complained')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
