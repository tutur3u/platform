'use client';

import useSearchParams from '@tuturuuu/ui/hooks/useSearchParams';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

type BlockedIpFiltersProps = {
  status: string;
};

export default function BlockedIpFilters({ status }: BlockedIpFiltersProps) {
  const t = useTranslations('blocked-ips');
  const searchParams = useSearchParams();

  function handleStatusChange(value: string) {
    searchParams.set(
      {
        page: '1',
        status: value === 'all' ? undefined : value,
      },
      false
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select onValueChange={handleStatusChange} value={status || 'all'}>
        <SelectTrigger className="w-45">
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
