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
  const t = useTranslations('blocked-ips');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get('status') || 'all';

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      params.set('status', value);
    } else {
      params.delete('status');
    }
    params.set('page', '1'); // Reset to first page when filtering
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={currentStatus} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={t('filter_by_status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('status_all')}</SelectItem>
          <SelectItem value="active">{t('status_active')}</SelectItem>
          <SelectItem value="expired">{t('status_expired')}</SelectItem>
          <SelectItem value="manually_unblocked">
            {t('status_unblocked')}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
