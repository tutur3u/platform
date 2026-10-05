'use client';
import { useQuery } from '@tanstack/react-query';
import { getCalendarProviderSeriesCapabilities } from '@tuturuuu/internal-api/calendar-provider-series';
import { getNativeCalendarSeries } from '@tuturuuu/internal-api/calendar-series';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useTranslations } from 'next-intl';
import { useWorkspaceActor } from '../../../../hooks/use-workspace-visibility';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../dialog';
import { NativeRecurrenceForm } from './native-recurrence-form';
export function NativeRecurrenceDialog({
  wsId,
  open,
  onOpenChange,
  occurrence,
  timezone,
  readOnly = false,
}: {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence?: CalendarEvent;
  timezone?: string;
  readOnly?: boolean;
}) {
  const actor = useWorkspaceActor();
  const t = useTranslations('calendar.recurrence');
  const series = useQuery({
    queryKey: [
      'native-calendar-series',
      wsId,
      actor?.actorId,
      occurrence?.seriesId,
    ],
    enabled: open && !!actor && !!occurrence?.seriesId,
    queryFn: async ({ signal }) => {
      actor!.assertActive();
      const value = await getNativeCalendarSeries(wsId, occurrence!.seriesId!, {
        signal,
      });
      actor!.assertActive();
      return value;
    },
    retry: false,
  });
  const capabilities = useQuery({
    queryKey: ['calendar-provider-capabilities', wsId, actor?.actorId],
    enabled: open && !!actor && !readOnly,
    queryFn: async ({ signal }) => {
      actor!.assertActive();
      const value = await getCalendarProviderSeriesCapabilities(wsId, {
        signal,
      });
      actor!.assertActive();
      return value;
    },
    retry: false,
    staleTime: 0,
  });
  if (!open) return null;
  const known = !!actor && (!occurrence || (!!series.data && !series.isError));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(occurrence ? 'edit' : 'create')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {known ? (
          <NativeRecurrenceForm
            key={`${actor!.actorId}:${wsId}:${occurrence?.id ?? 'new'}:${series.data?.revision ?? 0}`}
            wsId={wsId}
            actor={actor!}
            series={series.data}
            occurrence={occurrence}
            timezone={timezone}
            readOnly={readOnly}
            capabilities={capabilities.data}
            onDone={() => onOpenChange(false)}
            onReload={() => void series.refetch()}
          />
        ) : (
          <p role="status">
            {t(series.isPending && actor ? 'loading' : 'unavailable')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
