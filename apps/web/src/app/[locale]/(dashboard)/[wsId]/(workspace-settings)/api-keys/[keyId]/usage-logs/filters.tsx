'use client';

import { ChevronDown, ChevronUp, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';

export function UsageLogsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('ws-api-keys');

  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(true);

  const [fromDate, setFromDate] = useState<Date | undefined>(
    searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined
  );
  const [toDate, setToDate] = useState<Date | undefined>(
    searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined
  );
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    searchParams.get('status') || undefined
  );
  const [methodFilter, setMethodFilter] = useState<string | undefined>(
    searchParams.get('method') || undefined
  );

  const params = new URLSearchParams(searchParams.toString());

  // Update URL when filters change
  useEffect(() => {
    if (fromDate) {
      params.set('from', fromDate.toISOString());
    } else {
      params.delete('from');
    }

    if (toDate) {
      params.set('to', toDate.toISOString());
    } else {
      params.delete('to');
    }

    if (statusFilter) {
      params.set('status', statusFilter);
    } else {
      params.delete('status');
    }

    if (methodFilter) {
      params.set('method', methodFilter);
    } else {
      params.delete('method');
    }

    // Reset to page 1 when filters change
    params.delete('page');

    const newUrl = `${pathname}?${params.toString()}`;
    startTransition(() => {
      router.replace(newUrl, { scroll: false });
    });
  }, [
    fromDate,
    toDate,
    statusFilter,
    methodFilter,
    pathname,
    router,
    params.delete,
    params.set,
    params.toString,
  ]);

  const handleClearFilters = () => {
    setFromDate(undefined);
    setToDate(undefined);
    setStatusFilter(undefined);
    setMethodFilter(undefined);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('from');
    params.delete('to');
    params.delete('status');
    params.delete('method');
    params.delete('page');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const hasActiveFilters = fromDate || toDate || statusFilter || methodFilter;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <h3 className="font-semibold text-sm">
              {t('filters')}
              {hasActiveFilters && (
                <span className="ml-2 text-muted-foreground text-xs">
                  ({t('active_filters')})
                </span>
              )}
            </h3>
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              disabled={isPending}
              className="h-8 px-2 lg:px-3"
            >
              <X className="mr-2 h-4 w-4" />
              {t('clear_filters')}
            </Button>
          )}
        </div>

        <CollapsibleContent>
          <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-4">
            {/* From Date */}
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm">{t('from_date')}</label>
              <DateTimePicker
                date={fromDate}
                setDate={setFromDate}
                showTimeSelect={false}
                maxDate={toDate}
                allowClear={true}
                disabled={isPending}
              />
            </div>

            {/* To Date */}
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm">{t('to_date')}</label>
              <DateTimePicker
                date={toDate}
                setDate={setToDate}
                showTimeSelect={false}
                minDate={fromDate}
                allowClear={true}
                disabled={isPending}
              />
            </div>

            {/* Status Filter */}
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm">
                {t('filter_by_status')}
              </label>
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('all_statuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all_statuses')}</SelectItem>
                  <SelectItem value="2xx">{t('success_2xx')}</SelectItem>
                  <SelectItem value="4xx">{t('client_error_4xx')}</SelectItem>
                  <SelectItem value="5xx">{t('server_error_5xx')}</SelectItem>
                  <SelectItem value="200">200 OK</SelectItem>
                  <SelectItem value="201">201 Created</SelectItem>
                  <SelectItem value="400">400 Bad Request</SelectItem>
                  <SelectItem value="401">401 Unauthorized</SelectItem>
                  <SelectItem value="403">403 Forbidden</SelectItem>
                  <SelectItem value="404">404 Not Found</SelectItem>
                  <SelectItem value="429">429 Too Many Requests</SelectItem>
                  <SelectItem value="500">500 Internal Server Error</SelectItem>
                  <SelectItem value="503">503 Service Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Method Filter */}
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm">
                {t('filter_by_method')}
              </label>
              <Select
                value={methodFilter}
                onValueChange={setMethodFilter}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('all_methods')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all_methods')}</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                  <SelectItem value="HEAD">HEAD</SelectItem>
                  <SelectItem value="OPTIONS">OPTIONS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
