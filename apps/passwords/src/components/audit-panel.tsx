import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useI18n } from '../i18n/provider';
import type { AuditEvent } from '../service/port';

export function AuditPanel({ events }: { events: AuditEvent[] }) {
  const { t, locale } = useI18n();
  if (events.length === 0)
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">
        {t('audit.empty')}
      </p>
    );
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('audit.time')}</TableHead>
          <TableHead>{t('audit.event')}</TableHead>
          <TableHead>{t('audit.actor')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell>{dateFormat.format(new Date(event.at))}</TableCell>
            <TableCell>{t(`audit.type.${event.type}`)}</TableCell>
            <TableCell>{event.actorName ?? event.actorId}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
