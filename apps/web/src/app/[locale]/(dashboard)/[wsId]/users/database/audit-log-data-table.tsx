'use client';

import { Activity, Archive, Layers } from '@tuturuuu/icons';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { getAuditLogColumns } from './audit-log-columns';
import type { AuditLogEntry, AuditLogStatusFilter } from './audit-log-types';

interface Props {
  data: AuditLogEntry[];
  count: number;
  page: number;
  pageSize: number;
  status: AuditLogStatusFilter;
}

export function AuditLogDataTable({
  data,
  count,
  page,
  pageSize,
  status,
}: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateSearchParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    params.set('tab', 'audit-log');

    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <DataTable
      t={t}
      data={data}
      count={count}
      pageIndex={page > 0 ? page - 1 : 0}
      pageSize={pageSize}
      namespace="audit-log-table"
      columnGenerator={getAuditLogColumns}
      disableSearch
      defaultVisibility={{
        id: false,
        user_id: false,
        creator_id: false,
        ws_id: false,
      }}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={status}
            onValueChange={(value) =>
              updateSearchParams({
                logStatus: value === 'all' ? null : value,
                logPage: '1',
              })
            }
            disabled={isPending}
          >
            <SelectTrigger className="h-8 w-40 border-dashed bg-background">
              <SelectValue
                placeholder={t('audit-log-insights.status_filter_label')}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  <span>{t('audit-log-insights.status_all')}</span>
                </div>
              </SelectItem>
              <SelectItem value="archived">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  <span>{t('audit-log-insights.status_archived')}</span>
                </div>
              </SelectItem>
              <SelectItem value="active">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  <span>{t('audit-log-insights.status_active')}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
      onRefresh={() => router.refresh()}
      setParams={(params) => {
        updateSearchParams({
          logPage: params.page ? params.page.toString() : null,
          logPageSize: params.pageSize || null,
        });
      }}
      resetParams={() => {
        updateSearchParams({
          logStatus: null,
          logPage: null,
          logPageSize: null,
        });
      }}
      isFiltered={status !== 'all'}
    />
  );
}
