'use client';

import {
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileText,
  Search,
  User,
} from '@tuturuuu/icons';
import type { InventoryAuditLogSummary } from '@tuturuuu/internal-api/inventory';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { EmptyRow } from './operator-shell';

function labelFrom(value: string | null | undefined) {
  return (value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDateGroup(value: string | null, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
  }).format(date);
}

function AuditBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex h-6 min-w-0 max-w-full items-center rounded-md border border-border bg-muted/45 px-2 font-medium text-muted-foreground text-xs">
      <span className="truncate">{children}</span>
    </span>
  );
}

export function AuditRows({
  rows,
  wsId,
}: {
  rows: InventoryAuditLogSummary[];
  wsId?: string;
}) {
  const t = useTranslations('inventory.operator');
  const locale = useLocale();
  const [entityKind, setEntityKind] = useState('all');
  const [eventKind, setEventKind] = useState('all');
  const [source, setSource] = useState('all');
  const [actor, setActor] = useState('all');
  const [query, setQuery] = useState('');
  const filterOptions = useMemo(
    () => buildAuditFilterOptions(rows, t),
    [rows, t]
  );
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((row) => {
      const actorLabel = actorLabelFor(row, t);
      const searchable = [
        row.summary,
        row.entityKind,
        row.entityLabel,
        row.entityId,
        row.eventKind,
        row.source,
        actorLabel,
        ...row.changedFields,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return (
        (entityKind === 'all' || row.entityKind === entityKind) &&
        (eventKind === 'all' || row.eventKind === eventKind) &&
        (source === 'all' || row.source === source) &&
        (actor === 'all' || actorLabel === actor) &&
        (!needle || searchable.includes(needle))
      );
    });
  }, [actor, entityKind, eventKind, query, rows, source, t]);

  if (rows.length === 0) {
    return (
      <EmptyRow
        description={t('emptyDescriptions.audits')}
        label={t('empty')}
      />
    );
  }

  const groupedRows = filteredRows.reduce<
    Array<{ label: string; rows: InventoryAuditLogSummary[] }>
  >((groups, row) => {
    const label =
      formatDateGroup(row.occurredAt, locale) ?? t('audit.unknownDate');
    const existing = groups.find((group) => group.label === label);
    if (existing) {
      existing.rows.push(row);
      return groups;
    }

    groups.push({ label, rows: [row] });
    return groups;
  }, []);

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-3 lg:grid-cols-[minmax(0,1fr)_repeat(4,minmax(10rem,12rem))]">
        <label className="relative flex min-w-0 items-center">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('audit.searchPlaceholder')}
            value={query}
          />
        </label>
        <Combobox
          className="min-w-0"
          emptyText={t('audit.emptyFilter')}
          onChange={(value) =>
            setEntityKind(typeof value === 'string' ? value : 'all')
          }
          options={filterOptions.entityKinds}
          placeholder={t('audit.entityFilter')}
          searchPlaceholder={t('audit.entityFilter')}
          selected={entityKind}
        />
        <Combobox
          className="min-w-0"
          emptyText={t('audit.emptyFilter')}
          onChange={(value) =>
            setEventKind(typeof value === 'string' ? value : 'all')
          }
          options={filterOptions.eventKinds}
          placeholder={t('audit.eventFilter')}
          searchPlaceholder={t('audit.eventFilter')}
          selected={eventKind}
        />
        <Combobox
          className="min-w-0"
          emptyText={t('audit.emptyFilter')}
          onChange={(value) =>
            setSource(typeof value === 'string' ? value : 'all')
          }
          options={filterOptions.sources}
          placeholder={t('audit.sourceFilter')}
          searchPlaceholder={t('audit.sourceFilter')}
          selected={source}
        />
        <Combobox
          className="min-w-0"
          emptyText={t('audit.emptyFilter')}
          onChange={(value) =>
            setActor(typeof value === 'string' ? value : 'all')
          }
          options={filterOptions.actors}
          placeholder={t('audit.actorFilter')}
          searchPlaceholder={t('audit.actorFilter')}
          selected={actor}
        />
      </div>
      {filteredRows.length === 0 ? (
        <EmptyRow
          description={t('audit.noMatchesDescription')}
          label={t('audit.noMatches')}
        />
      ) : null}
      {groupedRows.map((group) => (
        <section className="grid min-w-0 gap-2" key={group.label}>
          <h2 className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {group.label}
          </h2>
          {group.rows.map((row) => (
            <AuditRow
              key={row.auditRecordId}
              locale={locale}
              row={row}
              wsId={wsId}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function AuditRow({
  locale,
  row,
  wsId,
}: {
  locale: string;
  row: InventoryAuditLogSummary;
  wsId?: string;
}) {
  const t = useTranslations('inventory.operator');
  const occurredAt = formatDate(row.occurredAt, locale);
  const actor = actorLabelFor(row, t);
  const entity = row.entityLabel ?? row.entityId ?? labelFrom(row.entityKind);
  const entityHref = wsId ? moduleLinkFor(row.entityKind, wsId) : null;

  return (
    <article
      className="grid min-w-0 gap-3 overflow-hidden rounded-lg border border-border bg-card p-3 text-sm"
      key={row.auditRecordId}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-full">
          <div className="flex min-w-0 items-center gap-2">
            <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="truncate font-medium">{row.summary}</p>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
            <AuditBadge>{labelFrom(row.eventKind)}</AuditBadge>
            <AuditBadge>{labelFrom(row.entityKind)}</AuditBadge>
            {row.source ? (
              <AuditBadge>{labelFrom(row.source)}</AuditBadge>
            ) : null}
            {row.changedFields.length > 0 ? (
              <AuditBadge>
                {t('audit.changedFields', {
                  count: row.changedFields.length,
                })}
              </AuditBadge>
            ) : null}
          </div>
        </div>
      </div>
      <div className="grid min-w-0 gap-2 text-muted-foreground text-xs sm:grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
        <span className="inline-flex min-w-0 items-center gap-2">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          {entityHref ? (
            <a
              className="inline-flex min-w-0 items-center gap-1 hover:text-foreground"
              href={entityHref}
            >
              <span className="truncate">{entity}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span className="truncate">{entity}</span>
          )}
        </span>
        <span className="inline-flex min-w-0 items-center gap-2">
          <User className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{actor}</span>
        </span>
        {occurredAt ? (
          <span className="inline-flex min-w-0 items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{occurredAt}</span>
          </span>
        ) : null}
      </div>
      {row.fieldChanges.length > 0 ? (
        <details className="group rounded-md border border-border bg-muted/15 p-2">
          <summary className="cursor-pointer font-medium text-xs">
            {t('audit.fieldChanges')}
          </summary>
          <dl className="mt-2 grid gap-2">
            {row.fieldChanges.map((change) => (
              <div
                className="grid min-w-0 gap-2 rounded-md bg-background p-2 text-xs md:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_minmax(0,1fr)]"
                key={`${row.auditRecordId}-${change.field}`}
              >
                <dt className="truncate font-medium">
                  {labelFrom(change.label || change.field)}
                </dt>
                <dd className="min-w-0 truncate text-muted-foreground">
                  {change.before ?? t('audit.emptyValue')}
                </dd>
                <dd className="min-w-0 truncate">
                  {change.after ?? t('audit.emptyValue')}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </article>
  );
}

function buildAuditFilterOptions(
  rows: InventoryAuditLogSummary[],
  t: ReturnType<typeof useTranslations>
) {
  const base = [{ label: t('statuses.all'), value: 'all' }];
  const entityKinds = distinctOptions(rows.map((row) => row.entityKind));
  const eventKinds = distinctOptions(rows.map((row) => row.eventKind));
  const sources = distinctOptions(rows.map((row) => row.source));
  const actors = distinctOptions(rows.map((row) => actorLabelFor(row, t)));

  return {
    actors: [...base, ...actors],
    entityKinds: [...base, ...entityKinds],
    eventKinds: [...base, ...eventKinds],
    sources: [...base, ...sources],
  };
}

function distinctOptions(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])]
    .sort((first, second) => first.localeCompare(second))
    .map((value) => ({ label: labelFrom(value), value }));
}

function actorLabelFor(
  row: InventoryAuditLogSummary,
  t: ReturnType<typeof useTranslations>
) {
  return (
    row.actor.displayName ??
    row.actor.workspaceUserId ??
    row.actor.authUid ??
    t('audit.systemActor')
  );
}

function moduleLinkFor(entityKind: string, wsId: string) {
  if (['product', 'stock'].includes(entityKind)) return `/${wsId}/catalog`;
  if (entityKind === 'bundle') return `/${wsId}/bundles`;
  if (entityKind === 'cost_profile') return `/${wsId}/costing`;
  if (entityKind === 'sale' || entityKind === 'checkout') {
    return `/${wsId}/commerce`;
  }
  if (entityKind === 'storefront' || entityKind === 'storefront_listing') {
    return `/${wsId}/storefront`;
  }
  return `/${wsId}/setup`;
}
