'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createNativeCalendarSeries,
  getNativeCalendarSeries,
  mutateNativeCalendarSeries,
  type NativeCalendarSeries,
} from '@tuturuuu/internal-api/calendar-series';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { nativeOccurrencesKey } from '../../../../hooks/use-native-calendar-occurrences';
import { useWorkspaceActor } from '../../../../hooks/use-workspace-visibility';
import { Button } from '../../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../dialog';
import { Label } from '../../label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../select';
import { NativeRecurrenceFields } from './native-recurrence-fields';
import {
  newRecurrenceDraft,
  type RecurrenceScope,
  recurrenceDraftPayload,
  recurrenceEditDraft,
  recurrenceMutation,
  recurrenceRequestIdentity,
} from './native-recurrence-model';
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
          <RecurrenceForm
            key={`${actor!.actorId}:${wsId}:${occurrence?.id ?? 'new'}:${series.data?.revision ?? 0}`}
            wsId={wsId}
            actor={actor!}
            series={series.data}
            occurrence={occurrence}
            timezone={timezone}
            readOnly={readOnly}
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
function RecurrenceForm({
  wsId,
  actor,
  series,
  occurrence,
  timezone,
  readOnly,
  onDone,
  onReload,
}: {
  wsId: string;
  actor: NonNullable<ReturnType<typeof useWorkspaceActor>>;
  series?: NativeCalendarSeries;
  occurrence?: CalendarEvent;
  timezone?: string;
  readOnly: boolean;
  onDone: () => void;
  onReload: () => void;
}) {
  const t = useTranslations('calendar.recurrence');
  const client = useQueryClient();
  const [scope, setScope] = useState<RecurrenceScope>('this');
  const [draft, setDraft] = useState(() =>
    series && occurrence
      ? recurrenceEditDraft(series, occurrence, 'this')
      : newRecurrenceDraft(
          timezone && timezone !== 'auto'
            ? timezone
            : Intl.DateTimeFormat().resolvedOptions().timeZone
        )
  );
  const identity = useRef(recurrenceRequestIdentity());
  const [invalid, setInvalid] = useState(false);
  const submission = useMutation({
    mutationFn: async (action: 'update' | 'delete') => {
      actor.assertActive();
      if (readOnly) throw new Error('Calendar is read only');
      const actorKey = `${actor.actorId}:${wsId}`;
      if (series && occurrence) {
        const payload = recurrenceMutation(
          draft,
          series,
          occurrence,
          scope,
          'placeholder',
          action
        );
        const { requestId: _placeholder, ...intent } = payload;
        const requestId = identity.current(actorKey, intent, action);
        await mutateNativeCalendarSeries(
          wsId,
          series.id,
          { ...payload, requestId },
          action
        );
      } else {
        if (action === 'delete') throw new Error('No series selected');
        const payload = recurrenceDraftPayload(draft);
        await createNativeCalendarSeries(wsId, {
          ...payload,
          requestId: identity.current(actorKey, payload, 'create'),
        });
      }
      actor.assertActive();
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: nativeOccurrencesKey(wsId) });
      void client.invalidateQueries({
        queryKey: ['native-calendar-series', wsId, actor.actorId],
      });
      onDone();
    },
  });
  const submit = (action: 'update' | 'delete') => {
    setInvalid(false);
    try {
      if (action === 'update')
        recurrenceDraftPayload(draft, !!series && scope === 'this');
      actor.assertActive();
      if (!readOnly) submission.mutate(action);
    } catch {
      setInvalid(true);
    }
  };
  const conflict =
    submission.error instanceof InternalApiError &&
    submission.error.status === 409;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit('update');
      }}
      className="space-y-4"
    >
      {series && occurrence && (
        <div className="space-y-1">
          <Label>{t('scope')}</Label>
          <Select
            value={scope}
            disabled={submission.isPending}
            onValueChange={(value) => {
              const next = value as RecurrenceScope;
              setScope(next);
              setDraft(recurrenceEditDraft(series, occurrence, next));
              setInvalid(false);
              submission.reset();
            }}
          >
            <SelectTrigger aria-label={t('scope')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['this', 'all', 'future'] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <NativeRecurrenceFields
        draft={draft}
        setDraft={(value) => {
          setDraft(value);
          setInvalid(false);
        }}
        occurrenceOnly={!!series && scope === 'this'}
        disabled={readOnly || submission.isPending}
      />
      {(invalid || submission.isError) && (
        <p role="alert" className="text-destructive text-sm">
          {t(invalid ? 'invalid' : conflict ? 'conflict' : 'failed')}
        </p>
      )}
      <DialogFooter>
        {conflict && (
          <Button type="button" variant="outline" onClick={onReload}>
            {t('reload')}
          </Button>
        )}
        {series && (
          <Button
            type="button"
            variant="destructive"
            disabled={readOnly || submission.isPending}
            onClick={() => submit('delete')}
          >
            {t('delete')}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={submission.isPending}
        >
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={readOnly || submission.isPending}>
          {t(submission.isPending ? 'saving' : 'save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
