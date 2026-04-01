'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { format } from 'date-fns';
import { humanizeAuditField } from '@/lib/workspace-user-audit/normalize';
import type { AuditLogEntry } from './audit-log-types';

function eventTone(eventKind: AuditLogEntry['eventKind']) {
  switch (eventKind) {
    case 'archived':
      return 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20';
    case 'reactivated':
      return 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20';
    case 'archive_until_changed':
      return 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20';
    case 'created':
      return 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20';
    case 'deleted':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    default:
      return 'bg-muted text-foreground border-border';
  }
}

function formatChangedFields(
  fields: string[],
  t: ColumnGeneratorOptions<AuditLogEntry>['t'],
  namespace: string
) {
  if (fields.length === 0) {
    return t(`${namespace}.no_fields`);
  }

  const firstField = fields[0];
  const firstLabel = firstField
    ? humanizeAuditField(firstField)
    : t(`${namespace}.no_fields`);

  if (fields.length === 1) {
    return firstLabel;
  }

  return t(`${namespace}.field_summary`, {
    firstField: firstLabel,
    count: fields.length - 1,
  });
}

export const getAuditLogColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<AuditLogEntry>): ColumnDef<AuditLogEntry>[] => {
  const resolvedNamespace = namespace || 'audit-log-table';

  return [
    {
      accessorKey: 'eventKind',
      header: t(`${resolvedNamespace}.action`),
      cell: ({ row }) => (
        <div className="space-y-2">
          <Badge
            variant="outline"
            className={`rounded-full px-2.5 py-0.5 ${eventTone(row.original.eventKind)}`}
          >
            {t(`${resolvedNamespace}.event_kind.${row.original.eventKind}`)}
          </Badge>
          <p className="text-muted-foreground text-sm">
            {row.original.summary}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'affectedUser.name',
      header: t(`${resolvedNamespace}.affected_user`),
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="font-medium">
            {row.original.affectedUser.name ||
              row.original.affectedUser.email ||
              t(`${resolvedNamespace}.unknown_user`)}
          </div>
          {row.original.affectedUser.email ? (
            <div className="text-muted-foreground text-xs">
              {row.original.affectedUser.email}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'actor.name',
      header: t(`${resolvedNamespace}.actor`),
      cell: ({ row }) => (
        <div className="space-y-1 text-sm">
          <div>
            {row.original.actor.name ||
              row.original.actor.email ||
              t(`${resolvedNamespace}.system`)}
          </div>
          {row.original.actor.email ? (
            <div className="text-muted-foreground text-xs">
              {row.original.actor.email}
            </div>
          ) : row.original.actor.authUid ? (
            <div className="font-mono text-[11px] text-muted-foreground">
              {row.original.actor.authUid}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'changedFields',
      header: t(`${resolvedNamespace}.changed_fields`),
      cell: ({ row }) => (
        <div className="text-sm">
          {formatChangedFields(
            row.original.changedFields,
            t,
            resolvedNamespace
          )}
        </div>
      ),
    },
    {
      accessorKey: 'source',
      header: t(`${resolvedNamespace}.source`),
      cell: ({ row }) => (
        <Badge variant="secondary" className="rounded-full">
          {t(`${resolvedNamespace}.source_label.${row.original.source}`)}
        </Badge>
      ),
    },
    {
      accessorKey: 'occurredAt',
      header: t(`${resolvedNamespace}.occurred_at`),
      cell: ({ row }) => {
        try {
          return (
            <div className="text-muted-foreground text-sm">
              {format(new Date(row.original.occurredAt), 'PPP p')}
            </div>
          );
        } catch {
          return (
            <div className="text-muted-foreground text-sm">
              {t(`${resolvedNamespace}.invalid_date`)}
            </div>
          );
        }
      },
    },
  ];
};
