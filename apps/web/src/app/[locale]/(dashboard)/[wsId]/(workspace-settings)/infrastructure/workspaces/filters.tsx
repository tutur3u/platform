'use client';

import { XCircle } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function Filters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('ws-overview');

  const tier = searchParams.get('tier') || '';
  const status = searchParams.get('status') || '';
  const workspaceType = searchParams.get('workspaceType') || '';
  const subCount = searchParams.get('subCount') || '';

  const hasActiveFilters = tier || status || workspaceType || subCount;

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const clearAllFilters = () => {
    const params = new URLSearchParams();
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={tier || 'all'}
        onValueChange={(value) => updateFilter('tier', value)}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder={t('filter_tier')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all_tiers')}</SelectItem>
          <SelectItem value="FREE">{t('tier_free')}</SelectItem>
          <SelectItem value="PLUS">{t('tier_plus')}</SelectItem>
          <SelectItem value="PRO">{t('tier_pro')}</SelectItem>
          <SelectItem value="ENTERPRISE">{t('tier_enterprise')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={status || 'all'}
        onValueChange={(value) => updateFilter('status', value)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t('filter_status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all_statuses')}</SelectItem>
          <SelectItem value="active">{t('status_active')}</SelectItem>
          <SelectItem value="trialing">{t('status_trialing')}</SelectItem>
          <SelectItem value="past_due">{t('status_past_due')}</SelectItem>
          <SelectItem value="canceled">{t('status_canceled')}</SelectItem>
          <SelectItem value="unpaid">{t('status_unpaid')}</SelectItem>
          <SelectItem value="incomplete">{t('status_incomplete')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={workspaceType || 'all'}
        onValueChange={(value) => updateFilter('workspaceType', value)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t('filter_type')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all_types')}</SelectItem>
          <SelectItem value="personal">{t('personal')}</SelectItem>
          <SelectItem value="team">{t('team')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={subCount || 'all'}
        onValueChange={(value) => updateFilter('subCount', value)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder={t('filter_sub_count')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all_sub_counts')}</SelectItem>
          <SelectItem value="none">{t('sub_count_none')}</SelectItem>
          <SelectItem value="single">{t('sub_count_single')}</SelectItem>
          <SelectItem value="multiple">{t('sub_count_multiple')}</SelectItem>
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="text-muted-foreground hover:text-foreground"
        >
          <XCircle className="mr-1 h-4 w-4" />
          {t('clear_filters')}
        </Button>
      )}
    </div>
  );
}
