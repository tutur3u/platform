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
  const t = useTranslations('email-audit-data-table');

  const status = searchParams.get('status') || '';
  const provider = searchParams.get('provider') || '';
  const templateType = searchParams.get('templateType') || '';
  const dateRange = searchParams.get('dateRange') || '';
  const entityType = searchParams.get('entityType') || '';
  const errorFilter = searchParams.get('errorFilter') || '';

  const hasActiveFilters =
    status ||
    provider ||
    templateType ||
    dateRange ||
    entityType ||
    errorFilter;

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

  const clearAllFilters = () => {
    const params = new URLSearchParams();
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Status Filter */}
      <Select
        value={status || 'all'}
        onValueChange={(value) => updateFilter('status', value)}
      >
        <SelectTrigger className="w-[140px]">
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

      {/* Provider Filter */}
      <Select
        value={provider || 'all'}
        onValueChange={(value) => updateFilter('provider', value)}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder={t('filter_by_provider')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all_providers')}</SelectItem>
          <SelectItem value="ses">AWS SES</SelectItem>
        </SelectContent>
      </Select>

      {/* Template Type Filter */}
      <Select
        value={templateType || 'all'}
        onValueChange={(value) => updateFilter('templateType', value)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder={t('filter_by_template')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all_templates')}</SelectItem>
          <SelectItem value="workspace-invite">
            {t('template_workspace_invite')}
          </SelectItem>
          <SelectItem value="notification-digest">
            {t('template_notification_digest')}
          </SelectItem>
          <SelectItem value="password-reset">
            {t('template_password_reset')}
          </SelectItem>
          <SelectItem value="email-verification">
            {t('template_email_verification')}
          </SelectItem>
          <SelectItem value="report">{t('template_report')}</SelectItem>
          <SelectItem value="newsletter">{t('template_newsletter')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Date Range Filter */}
      <Select
        value={dateRange || 'all'}
        onValueChange={(value) => updateFilter('dateRange', value)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t('filter_by_date')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all_time')}</SelectItem>
          <SelectItem value="today">{t('today')}</SelectItem>
          <SelectItem value="yesterday">{t('yesterday')}</SelectItem>
          <SelectItem value="7days">{t('last_7_days')}</SelectItem>
          <SelectItem value="30days">{t('last_30_days')}</SelectItem>
          <SelectItem value="90days">{t('last_90_days')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Entity Type Filter */}
      <Select
        value={entityType || 'all'}
        onValueChange={(value) => updateFilter('entityType', value)}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder={t('filter_by_entity')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all_entities')}</SelectItem>
          <SelectItem value="notification">
            {t('entity_notification')}
          </SelectItem>
          <SelectItem value="post">{t('entity_post')}</SelectItem>
          <SelectItem value="lead">{t('entity_lead')}</SelectItem>
          <SelectItem value="invite">{t('entity_invite')}</SelectItem>
          <SelectItem value="report">{t('entity_report')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Error Filter */}
      <Select
        value={errorFilter || 'all'}
        onValueChange={(value) => updateFilter('errorFilter', value)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t('filter_by_error')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all_emails')}</SelectItem>
          <SelectItem value="has-error">{t('has_error_only')}</SelectItem>
          <SelectItem value="no-error">{t('no_error_only')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear Filters */}
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
