'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
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
      className="h-full space-y-8"
      data-testid={`native-settings-panel-${activeTab}`}
    >
      {children}
    </div>
  );
}

export function NativePanelLoading() {
  const t = useTranslations();

  return (
    <SettingsSection>
      <SettingsSectionMessage>{t('common.loading')}</SettingsSectionMessage>
    </SettingsSection>
  );
}

export function NativePanelError({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations();

  return (
    <SettingsSection>
      <SettingsSectionMessage
        action={
          onRetry && (
            <Button onClick={onRetry} size="sm" type="button" variant="outline">
              <RefreshCw className="h-4 w-4" />
              {t('common.refresh')}
            </Button>
          )
        }
        tone="error"
      >
        {t('common.error')}
      </SettingsSectionMessage>
    </SettingsSection>
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
      <SettingsSection>
        <SettingsSectionMessage>{t('common.empty')}</SettingsSectionMessage>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {resolvedColumns.map((column) => (
              <TableHead className="md:px-5" key={column}>
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              className="hover:bg-transparent"
              key={String(row.id ?? index)}
            >
              {resolvedColumns.map((column) => (
                <TableCell
                  className="max-w-72 truncate px-4 py-2.5 align-top md:px-5"
                  key={column}
                  title={formatCell(row[column])}
                >
                  {formatCell(row[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsSection>
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
    <SettingsSection>
      {items.map((item) => (
        <SettingItemTab key={item.label} title={item.label}>
          <span className="font-medium text-sm tabular-nums">{item.value}</span>
        </SettingItemTab>
      ))}
    </SettingsSection>
  );
}
