import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import type {
  DevboxAdminCacheRecord,
  DevboxAdminEvent,
} from '@/lib/devboxes/admin-store';

type DevboxControlTranslator = (key: string) => string;

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell
        className="py-8 text-center text-muted-foreground"
        colSpan={colSpan}
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

export function EventsTable({
  events,
  t,
}: {
  events: DevboxAdminEvent[];
  t: DevboxControlTranslator;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columns.event')}</TableHead>
          <TableHead>{t('columns.run')}</TableHead>
          <TableHead>{t('columns.created')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.length === 0 ? (
          <EmptyRow colSpan={3} label={t('empty.events')} />
        ) : (
          events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <div className="font-medium">{event.event_type}</div>
                <div className="max-w-3xl whitespace-pre-wrap text-muted-foreground text-sm">
                  {event.message ?? '-'}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {event.run_id}
              </TableCell>
              <TableCell>{formatDate(event.created_at)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export function CachesTable({
  caches,
  t,
}: {
  caches: DevboxAdminCacheRecord[];
  t: DevboxControlTranslator;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columns.cache')}</TableHead>
          <TableHead>{t('columns.runner')}</TableHead>
          <TableHead>{t('columns.size')}</TableHead>
          <TableHead>{t('columns.last_used')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {caches.length === 0 ? (
          <EmptyRow colSpan={4} label={t('empty.caches')} />
        ) : (
          caches.map((cache) => (
            <TableRow key={cache.id}>
              <TableCell>
                <div className="font-medium">{cache.cache_type}</div>
                <div className="font-mono text-muted-foreground text-xs">
                  {cache.cache_key}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {cache.runner_id ?? '-'}
              </TableCell>
              <TableCell>{formatBytes(cache.size_bytes)}</TableCell>
              <TableCell>{formatDate(cache.last_used_at)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
