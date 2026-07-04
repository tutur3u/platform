'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export function NativePanelFrame({
  activeTab,
  children,
}: {
  activeTab: string;
  children: ReactNode;
}) {
  return (
    <div
      className="h-full space-y-6"
      data-testid={`native-settings-panel-${activeTab}`}
    >
      {children}
    </div>
  );
}

export function NativePanelLoading() {
  const t = useTranslations();

  return (
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed">
      <div className="text-muted-foreground text-sm">{t('common.loading')}</div>
    </div>
  );
}

export function NativePanelError({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations();

  return (
    <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="font-medium text-destructive">{t('common.error')}</p>
      {onRetry && (
        <Button onClick={onRetry} size="sm" type="button" variant="secondary">
          <RefreshCw className="h-4 w-4" />
          {t('common.refresh')}
        </Button>
      )}
    </div>
  );
}

function normalizeRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  for (const key of [
    'data',
    'items',
    'apps',
    'members',
    'users',
    'workspaces',
  ]) {
    const value = record[key];
    if (Array.isArray(value)) return value as Record<string, unknown>[];
  }

  return [];
}

function formatCell(value: unknown) {
  if (value == null || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function NativeSimpleTable({
  columns,
  rows,
}: {
  columns?: string[];
  rows: Record<string, unknown>[];
}) {
  const t = useTranslations();
  const resolvedColumns =
    columns ??
    Array.from(
      new Set(
        rows.flatMap((row) =>
          Object.keys(row).filter((key) => !key.endsWith('_hash'))
        )
      )
    ).slice(0, 5);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
        {t('common.empty')}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {resolvedColumns.map((column) => (
                <th className="px-3 py-2 text-left font-medium" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr className="border-t" key={String(row.id ?? index)}>
                {resolvedColumns.map((column) => (
                  <td
                    className="max-w-72 truncate px-3 py-2 align-top"
                    key={column}
                    title={formatCell(row[column])}
                  >
                    {formatCell(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NativeApiPreviewPanel({
  columns,
  path,
  queryKey,
}: {
  columns?: string[];
  path: string;
  queryKey: readonly unknown[];
}) {
  const query = useQuery({
    queryFn: () => apiFetch<unknown>(path, { cache: 'no-store' }),
    queryKey,
    staleTime: 30_000,
  });

  if (query.isPending) return <NativePanelLoading />;
  if (query.isError)
    return <NativePanelError onRetry={() => query.refetch()} />;

  return (
    <NativeSimpleTable columns={columns} rows={normalizeRows(query.data)} />
  );
}

export function NativeMetricGrid({
  items,
}: {
  items: Array<{ label: string; value: number | string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div className="rounded-lg border bg-card p-4" key={item.label}>
          <p className="text-muted-foreground text-sm">{item.label}</p>
          <p className="mt-2 font-semibold text-2xl tabular-nums">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
