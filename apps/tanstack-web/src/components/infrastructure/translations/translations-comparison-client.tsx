'use client';

import { Card, CardContent } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { downloadText } from './download-text';
import { TranslationControls } from './translation-controls';
import { TranslationDetailDialog } from './translation-detail-dialog';
import { TranslationSummary } from './translation-summary';
import {
  buildTranslationRows,
  buildTranslationsCsv,
  buildTranslationsJson,
  filterTranslations,
  summarizeTranslations,
} from './translation-utils';
import { TranslationsHeader } from './translations-header';
import { TranslationsPagination } from './translations-pagination';
import { TranslationsTable } from './translations-table';
import type {
  FlatTranslation,
  TranslationMessages,
  TranslationStatus,
  TranslationStatusFilter,
} from './types';

type TranslationsComparisonClientProps = {
  enMessages: TranslationMessages;
  viMessages: TranslationMessages;
};

export function TranslationsComparisonClient({
  enMessages,
  viMessages,
}: TranslationsComparisonClientProps) {
  const t = useTranslations('translations-inspector');
  const [query, setQuery] = useState('');
  const [namespace, setNamespace] = useState('all');
  const [status, setStatus] = useState<TranslationStatusFilter>('all');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<FlatTranslation | null>(null);

  const rows = useMemo(
    () => buildTranslationRows(enMessages, viMessages),
    [enMessages, viMessages]
  );
  const namespaces = useMemo(
    () => Array.from(new Set(rows.map((row) => row.namespace))).sort(),
    [rows]
  );
  const filteredRows = useMemo(
    () => filterTranslations(rows, { namespace, query, status }),
    [namespace, query, rows, status]
  );
  const stats = useMemo(() => summarizeTranslations(rows), [rows]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const statusLabels: Record<TranslationStatus, string> = {
    complete: t('status_complete'),
    'missing-en': t('status_missing_en'),
    'missing-vi': t('status_missing_vi'),
  };

  function copyKey(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(text);
      toast.success(t('copied'));
      window.setTimeout(() => setCopiedKey(null), 1600);
    });
  }

  function exportCsv() {
    downloadText(
      'translations.csv',
      'text/csv;charset=utf-8;',
      buildTranslationsCsv(filteredRows)
    );
    toast.success(t('exported', { count: filteredRows.length }));
  }

  function exportJson() {
    downloadText(
      'translations.json',
      'application/json;charset=utf-8;',
      buildTranslationsJson(filteredRows)
    );
    toast.success(t('exported', { count: filteredRows.length }));
  }

  return (
    <div className="space-y-4">
      <TranslationsHeader description={t('description')} title={t('title')} />
      <TranslationSummary
        labels={{
          complete: t('status_complete'),
          missingEn: t('status_missing_en'),
          missingVi: t('status_missing_vi'),
          total: t('total'),
        }}
        stats={stats}
      />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <TranslationControls
            labels={{
              allNamespaces: t('all_namespaces'),
              allStatuses: t('all_statuses'),
              complete: t('status_complete'),
              csv: t('export_csv'),
              json: t('export_json'),
              missingEn: t('status_missing_en'),
              missingVi: t('status_missing_vi'),
              namespace: t('namespace'),
              pageSize: t('page_size'),
              search: t('search'),
              status: t('status'),
            }}
            namespace={namespace}
            namespaces={namespaces}
            onExportCsv={exportCsv}
            onExportJson={exportJson}
            onNamespaceChange={(value) => {
              setNamespace(value);
              setPage(1);
            }}
            onPageSizeChange={(value) => {
              setPageSize(value);
              setPage(1);
            }}
            onQueryChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            onStatusChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            pageSize={pageSize}
            query={query}
            status={status}
          />
          <TranslationsTable
            copiedKey={copiedKey}
            labels={{
              actions: t('actions'),
              copy: t('copy_key'),
              empty: t('empty'),
              english: t('english'),
              key: t('key'),
              status: t('status'),
              statuses: statusLabels,
              view: t('view_details'),
              vietnamese: t('vietnamese'),
            }}
            onCopy={copyKey}
            onView={setSelectedRow}
            rows={pagedRows}
          />
          <TranslationsPagination
            count={pagedRows.length}
            labels={{
              next: t('next'),
              previous: t('previous'),
              showing: t('showing', {
                count: pagedRows.length,
                total: filteredRows.length,
              }),
            }}
            onPageChange={setPage}
            page={page}
            total={filteredRows.length}
            totalPages={totalPages}
          />
        </CardContent>
      </Card>
      <TranslationDetailDialog
        labels={{
          english: t('english'),
          key: t('key'),
          status: statusLabels,
          vietnamese: t('vietnamese'),
        }}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
        row={selectedRow}
      />
    </div>
  );
}
