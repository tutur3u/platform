'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Lock } from '@tuturuuu/icons';
import {
  type FeeLockListQuery,
  listFeeLocks,
} from '@tuturuuu/internal-api/finance-fee-lock';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';
import { FeeLockExportDialog } from './fee-lock-export-dialog';
import { formatFeeLockMonth, shiftFeeLockMonth } from './fee-lock-month';
import { FeeLockTable } from './fee-lock-table';
import { FeeNoticeTemplateEditor } from './fee-notice-template-editor';

const ALL = 'all';
const PAGE_SIZE = 50;
const STATUSES = ['none', 'draft', 'locked'] as const;

interface Props {
  wsId: string;
  currency: string;
  initialMonth: string;
  /** export_finance_data AND view_invoices, resolved on the server. */
  canExport?: boolean;
  /** manage_finance, like the template PUT; viewing needs view_invoices. */
  canEditTemplate?: boolean;
}

function FilterSelect(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger className="w-44" aria-label={props.label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FeeLockPage({
  wsId,
  currency,
  initialMonth,
  canExport = false,
  canEditTemplate = false,
}: Props) {
  const t = useTranslations('ws-fee-lock');
  const common = useTranslations('common');
  const [filters, setFilters] = useState({
    month: initialMonth,
    groupId: ALL,
    status: ALL,
    q: '',
    page: 1,
  });
  const [search, setSearch] = useState('');
  const { data: groups = [] } = useWorkspaceUserGroups(wsId);
  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, page: 1, ...patch }));
  const query: FeeLockListQuery = {
    ...filters,
    groupId: filters.groupId === ALL ? undefined : filters.groupId,
    status: STATUSES.find((status) => status === filters.status),
    q: filters.q || undefined,
    pageSize: PAGE_SIZE,
  };
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['fee-locks', wsId, query],
    queryFn: () => listFeeLocks(wsId, query),
    placeholderData: keepPreviousData,
  });
  const pages = Math.ceil((data?.count ?? 0) / PAGE_SIZE);

  return (
    <Tabs defaultValue="list" className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 font-semibold text-2xl">
          <Lock className="size-6" />
          {t('title')}
        </h1>
        <fieldset className="flex items-center gap-1" aria-label={t('month')}>
          {([-1, 1] as const).map((delta) => (
            <Button
              key={delta}
              variant="outline"
              size="icon"
              className={delta > 0 ? 'order-last' : undefined}
              aria-label={t(delta > 0 ? 'next_month' : 'previous_month')}
              onClick={() =>
                update({ month: shiftFeeLockMonth(filters.month, delta) })
              }
            >
              {delta > 0 ? <ChevronRight /> : <ChevronLeft />}
            </Button>
          ))}
          <span className="min-w-24 text-center font-medium tabular-nums">
            {formatFeeLockMonth(filters.month)}
          </span>
        </fieldset>
      </header>
      <TabsList>
        <TabsTrigger value="list">{t('title')}</TabsTrigger>
        <TabsTrigger value="template">{t('template_tab')}</TabsTrigger>
      </TabsList>
      <TabsContent value="list" className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="min-w-60 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              update({ q: search.trim() });
            }}
          >
            <Input
              type="search"
              aria-label={t('search')}
              placeholder={t('search')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
          <FilterSelect
            label={t('class_filter')}
            value={filters.groupId}
            onChange={(groupId) => update({ groupId })}
            options={[
              { value: ALL, label: t('all_classes') },
              ...groups.map((group) => ({
                value: group.id,
                label: group.name,
              })),
            ]}
          />
          <FilterSelect
            label={t('status')}
            value={filters.status}
            onChange={(status) => update({ status })}
            options={[
              { value: ALL, label: t('all_statuses') },
              ...STATUSES.map((value) => ({
                value,
                label: t(
                  value === 'locked' ? 'status_locked_any' : `status_${value}`
                ),
              })),
            ]}
          />
          {canExport && (
            <FeeLockExportDialog
              wsId={wsId}
              month={filters.month}
              groupId={query.groupId}
              labels={{
                export: t('export'),
                export_title: t('export_title'),
                export_locked_only: t('export_locked_only'),
                export_all: t('export_all'),
                export_too_many: (count) => t('export_too_many', { count }),
                export_done: (count) => t('export_done', { count }),
                export_failed: t('export_failed'),
                cancel: common('cancel'),
              }}
            />
          )}
        </div>
        {error ? (
          <div role="alert" className="flex items-center gap-3 text-sm">
            {t('load_error')}
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {common('retry')}
            </Button>
          </div>
        ) : isPending ? (
          <Skeleton className="h-72 w-full" />
        ) : data?.data.length ? (
          <FeeLockTable rows={data.data} currency={currency} />
        ) : (
          <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            {t('no_students')}
          </p>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-3 text-sm">
            {([-1, 1] as const).map((delta) => (
              <Button
                key={delta}
                variant="outline"
                size="sm"
                className={delta > 0 ? 'order-last' : undefined}
                disabled={
                  isFetching ||
                  filters.page + delta < 1 ||
                  filters.page + delta > pages
                }
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: current.page + delta,
                  }))
                }
              >
                {common(delta > 0 ? 'next' : 'previous')}
              </Button>
            ))}
            <span className="tabular-nums">
              {filters.page}/{pages}
            </span>
          </div>
        )}
      </TabsContent>
      <TabsContent value="template">
        <FeeNoticeTemplateEditor
          wsId={wsId}
          canEdit={canEditTemplate}
          labels={{
            template_body: t('template_body'),
            payment_line: t('payment_line'),
            item_format: t('item_format'),
            item_separator: t('item_separator'),
            grouping: t('grouping'),
            grouping_combined: t('grouping_combined'),
            grouping_per_class: t('grouping_per_class'),
            placeholders: t('placeholders'),
            unknown_placeholder: (name) => t('unknown_placeholder', { name }),
            preview: t('preview'),
            versions: t('versions'),
            restore_version: t('restore_version'),
            template_saved: t('template_saved'),
            conflict_body: t('conflict_body'),
            save: common('save'),
          }}
        />
      </TabsContent>
    </Tabs>
  );
}
