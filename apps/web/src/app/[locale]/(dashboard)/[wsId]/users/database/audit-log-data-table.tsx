'use client';

import { Search } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { getAuditLogColumns } from './audit-log-columns';
import type {
  AuditLogEntry,
  AuditLogEventKindFilter,
  AuditLogSourceFilter,
} from './audit-log-types';

interface Props {
  data: AuditLogEntry[];
  count: number;
  page: number;
  pageSize: number;
  eventKind: AuditLogEventKindFilter;
  source: AuditLogSourceFilter;
  affectedUserQuery: string;
  actorQuery: string;
}

function FilterInput({
  defaultValue,
  placeholder,
  disabled,
  onCommit,
}: {
  defaultValue: string;
  placeholder: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  return (
    <div className="relative min-w-48">
      <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        key={defaultValue}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        className="h-9 pl-8"
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onCommit(event.currentTarget.value);
          }
        }}
      />
    </div>
  );
}

export function AuditLogDataTable({
  data,
  count,
  page,
  pageSize,
  eventKind,
  source,
  affectedUserQuery,
  actorQuery,
}: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selectedEvent, setSelectedEvent] = useState<AuditLogEntry | null>(
    null
  );

  const isFiltered = useMemo(() => {
    return (
      eventKind !== 'all' ||
      source !== 'all' ||
      affectedUserQuery.length > 0 ||
      actorQuery.length > 0
    );
  }, [actorQuery, affectedUserQuery, eventKind, source]);

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
    <>
      <DataTable
        t={t}
        data={data}
        count={count}
        pageIndex={page > 0 ? page - 1 : 0}
        pageSize={pageSize}
        namespace="audit-log-table"
        columnGenerator={getAuditLogColumns}
        disableSearch
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={eventKind}
              onValueChange={(value) =>
                updateSearchParams({
                  logEventKind: value === 'all' ? null : value,
                  logPage: '1',
                })
              }
              disabled={isPending}
            >
              <SelectTrigger className="h-9 w-40 bg-background">
                <SelectValue
                  placeholder={t('audit-log-insights.event_filter_label')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('audit-log-insights.event_kind_all')}
                </SelectItem>
                <SelectItem value="created">
                  {t('audit-log-table.event_kind.created')}
                </SelectItem>
                <SelectItem value="updated">
                  {t('audit-log-table.event_kind.updated')}
                </SelectItem>
                <SelectItem value="archived">
                  {t('audit-log-table.event_kind.archived')}
                </SelectItem>
                <SelectItem value="reactivated">
                  {t('audit-log-table.event_kind.reactivated')}
                </SelectItem>
                <SelectItem value="archive_until_changed">
                  {t('audit-log-table.event_kind.archive_until_changed')}
                </SelectItem>
                <SelectItem value="deleted">
                  {t('audit-log-table.event_kind.deleted')}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={source}
              onValueChange={(value) =>
                updateSearchParams({
                  logSource: value === 'all' ? null : value,
                  logPage: '1',
                })
              }
              disabled={isPending}
            >
              <SelectTrigger className="h-9 w-36 bg-background">
                <SelectValue
                  placeholder={t('audit-log-insights.source_filter_label')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('audit-log-insights.source_all')}
                </SelectItem>
                <SelectItem value="live">
                  {t('audit-log-table.source_label.live')}
                </SelectItem>
                <SelectItem value="backfilled">
                  {t('audit-log-table.source_label.backfilled')}
                </SelectItem>
              </SelectContent>
            </Select>

            <FilterInput
              defaultValue={affectedUserQuery}
              placeholder={t(
                'audit-log-insights.affected_user_search_placeholder'
              )}
              disabled={isPending}
              onCommit={(value) =>
                updateSearchParams({
                  logAffectedUser: value.trim() || null,
                  logPage: '1',
                })
              }
            />

            <FilterInput
              defaultValue={actorQuery}
              placeholder={t('audit-log-insights.actor_search_placeholder')}
              disabled={isPending}
              onCommit={(value) =>
                updateSearchParams({
                  logActor: value.trim() || null,
                  logPage: '1',
                })
              }
            />
          </div>
        }
        onRefresh={() => router.refresh()}
        onRowClick={(row) => setSelectedEvent(row)}
        setParams={(params) => {
          updateSearchParams({
            logPage: params.page ? params.page.toString() : null,
            logPageSize: params.pageSize || null,
          });
        }}
        resetParams={() => {
          updateSearchParams({
            logEventKind: null,
            logSource: null,
            logAffectedUser: null,
            logActor: null,
            logPage: null,
            logPageSize: null,
          });
        }}
        isFiltered={isFiltered}
      />

      <Sheet
        open={selectedEvent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEvent(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          {selectedEvent ? (
            <>
              <SheetHeader className="border-b">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full">
                    {t(`audit-log-table.event_kind.${selectedEvent.eventKind}`)}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full">
                    {t(`audit-log-table.source_label.${selectedEvent.source}`)}
                  </Badge>
                </div>
                <SheetTitle>{selectedEvent.summary}</SheetTitle>
                <SheetDescription>
                  {t('audit-log-insights.detail_description')}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-6 overflow-y-auto p-4">
                <section className="grid gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 md:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                      {t('audit-log-table.affected_user')}
                    </p>
                    <p className="mt-2 font-medium">
                      {selectedEvent.affectedUser.name ||
                        selectedEvent.affectedUser.email ||
                        t('audit-log-table.unknown_user')}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                      {t('audit-log-table.actor')}
                    </p>
                    <p className="mt-2 font-medium">
                      {selectedEvent.actor.name ||
                        selectedEvent.actor.email ||
                        t('audit-log-table.system')}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                      {t('audit-log-table.occurred_at')}
                    </p>
                    <p className="mt-2 font-medium">
                      {new Date(selectedEvent.occurredAt).toLocaleString()}
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="font-semibold">
                      {t('audit-log-table.field_changes_title')}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {t('audit-log-table.field_changes_description')}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {selectedEvent.fieldChanges.map((fieldChange) => (
                      <div
                        key={fieldChange.field}
                        className="rounded-2xl border border-border/60"
                      >
                        <div className="border-border/60 border-b px-4 py-3 font-medium">
                          {fieldChange.label}
                        </div>
                        <div className="grid gap-0 md:grid-cols-2">
                          <div className="border-border/60 p-4 md:border-r">
                            <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                              {t('audit-log-table.before')}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                              {fieldChange.before ??
                                t('audit-log-table.empty_value')}
                            </p>
                          </div>
                          <div className="p-4">
                            <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                              {t('audit-log-table.after')}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                              {fieldChange.after ??
                                t('audit-log-table.empty_value')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
