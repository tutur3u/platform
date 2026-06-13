'use client';

import { CalendarDays, ClipboardList, FileText, User } from '@tuturuuu/icons';
import type { InventoryAuditLogSummary } from '@tuturuuu/internal-api/inventory';
import { useLocale, useTranslations } from 'next-intl';
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

export function AuditRows({ rows }: { rows: InventoryAuditLogSummary[] }) {
  const t = useTranslations('inventory.operator');
  const locale = useLocale();

  if (rows.length === 0) {
    return (
      <EmptyRow
        description={t('emptyDescriptions.audits')}
        label={t('empty')}
      />
    );
  }

  const groupedRows = rows.reduce<
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
      {groupedRows.map((group) => (
        <section className="grid min-w-0 gap-2" key={group.label}>
          <h2 className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {group.label}
          </h2>
          {group.rows.map((row) => {
            const occurredAt = formatDate(row.occurredAt, locale);
            const actor =
              row.actor.displayName ??
              row.actor.workspaceUserId ??
              row.actor.authUid ??
              t('audit.systemActor');
            const entity =
              row.entityLabel ?? row.entityId ?? labelFrom(row.entityKind);

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
                    <span className="truncate">{entity}</span>
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
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
