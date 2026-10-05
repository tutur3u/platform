'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CalendarProviderSeriesCapabilities,
  CalendarProviderSeriesSource,
} from '@tuturuuu/internal-api/calendar-provider-series';
import {
  createNativeCalendarSeries,
  mutateNativeCalendarSeries,
  type NativeCalendarSeries,
} from '@tuturuuu/internal-api/calendar-series';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { inspectCalendarRecurrenceSlot } from '@tuturuuu/utils/calendar-recurrence';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';
import { nativeOccurrencesKey } from '../../../../hooks/use-native-calendar-occurrences';
import type { useWorkspaceActor } from '../../../../hooks/use-workspace-visibility';
import { Button } from '../../button';
import { DialogFooter } from '../../dialog';
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
import { useProviderRecurrenceOperation } from './use-provider-recurrence-operation';
export function NativeRecurrenceForm({
  wsId,
  actor,
  series,
  occurrence,
  timezone,
  readOnly,
  capabilities,
  onDone,
  onReload,
}: {
  wsId: string;
  actor: NonNullable<ReturnType<typeof useWorkspaceActor>>;
  series?: NativeCalendarSeries;
  occurrence?: CalendarEvent;
  timezone?: string;
  readOnly: boolean;
  capabilities?: CalendarProviderSeriesCapabilities;
  onDone: () => void;
  onReload: () => void;
}) {
  const t = useTranslations('calendar.recurrence');
  const client = useQueryClient();
  const [scope, setScope] = useState<RecurrenceScope>('this');
  const createsFutureTail = useMemo(() => {
    if (scope !== 'future' || !series || !occurrence?.originalStartLocal)
      return false;
    try {
      return (
        inspectCalendarRecurrenceSlot({
          rule: series.rule,
          anchor: series.anchor,
          originalStartLocal: occurrence.originalStartLocal,
        }).precedingCount > 0
      );
    } catch {
      return false;
    }
  }, [scope, series, occurrence?.originalStartLocal]);
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
  const [sourceId, setSourceId] = useState('native');
  const selectedSource =
    series?.providerSource ??
    capabilities?.sources.find(
      (source) => `${source.provider}:${source.connectionId}` === sourceId
    );
  const providerSource: CalendarProviderSeriesSource | undefined =
    selectedSource && {
      provider: selectedSource.provider,
      connectionId: selectedSource.connectionId,
    };
  const providerAllowed =
    !!providerSource &&
    !!capabilities?.enabled &&
    capabilities.sources.some(
      (source) =>
        source.provider === providerSource.provider &&
        source.connectionId === providerSource.connectionId
    );
  const finish = useCallback(() => {
    actor.assertActive();
    void client.invalidateQueries({ queryKey: nativeOccurrencesKey(wsId) });
    void client.invalidateQueries({
      queryKey: ['native-calendar-series', wsId, actor.actorId],
    });
    onDone();
  }, [actor, client, wsId, onDone]);
  const finishProvider = useCallback(() => {
    actor.assertActive();
    // Calendar combines canonical occurrences with retained provider/database views.
    // Revalidate those views only after provider publication, including a resumed creation.
    void client.invalidateQueries({
      queryKey: ['databaseCalendarEvents', wsId],
    });
    void client.invalidateQueries({ queryKey: ['googleCalendarEvents', wsId] });
    finish();
  }, [actor, client, wsId, finish]);
  const providerOperation = useProviderRecurrenceOperation({
    wsId,
    actor,
    identity: occurrence?.id ?? 'new',
    onApplied: finishProvider,
  });
  const providerBlocked = !!series?.providerSource && !providerAllowed;
  const frozen = readOnly || providerBlocked || providerOperation.pending;

  const submission = useMutation({
    mutationFn: async (action: 'update' | 'delete') => {
      actor.assertActive();
      if (frozen) throw new Error('Calendar is read only');
      const actorKey = `${actor.actorId}:${wsId}:${providerSource ? `${providerSource.provider}:${providerSource.connectionId}` : 'native'}`;
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
        if (providerSource) {
          if (!providerAllowed) throw new Error('Provider source unavailable');
          providerOperation.submission.mutate({
            ...payload,
            requestId,
            action,
            source: providerSource,
            seriesId: series.id,
          });
          return 'provider' as const;
        }
        await mutateNativeCalendarSeries(
          wsId,
          series.id,
          { ...payload, requestId },
          action
        );
      } else {
        if (action === 'delete') throw new Error('No series selected');
        const payload = recurrenceDraftPayload(draft);
        const requestId = identity.current(actorKey, payload, 'create');
        if (sourceId !== 'native') {
          if (!providerSource || !providerAllowed)
            throw new Error('Provider source unavailable');
          providerOperation.submission.mutate({
            ...payload,
            requestId,
            action: 'create',
            source: providerSource,
          });
          return 'provider' as const;
        }
        await createNativeCalendarSeries(wsId, { ...payload, requestId });
      }
      actor.assertActive();
    },
    onSuccess: (result) => {
      if (result !== 'provider') finish();
    },
  });
  const submit = (action: 'update' | 'delete') => {
    setInvalid(false);
    try {
      if (action === 'update')
        recurrenceDraftPayload(draft, !!series && scope === 'this');
      actor.assertActive();
      if (!frozen) submission.mutate(action);
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
      {!series && (
        <div className="space-y-1">
          <Label>{t('provider_source')}</Label>
          <Select
            value={sourceId}
            disabled={frozen || submission.isPending}
            onValueChange={setSourceId}
          >
            <SelectTrigger aria-label={t('provider_source')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="native">{t('native_source')}</SelectItem>
              {capabilities?.enabled &&
                capabilities.sources.map((source) => (
                  <SelectItem
                    key={`${source.provider}:${source.connectionId}`}
                    value={`${source.provider}:${source.connectionId}`}
                  >
                    {source.label} ·{' '}
                    {source.provider === 'google' ? 'Google' : 'Outlook'}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {providerBlocked && <p role="status">{t('provider_disabled')}</p>}
      {providerOperation.pending && (
        <div role="status" className="space-y-2">
          <p>{t('provider_pending')}</p>
          <Button
            type="button"
            variant="outline"
            disabled={providerOperation.submission.isPending}
            onClick={providerOperation.retry}
          >
            {t('provider_retry')}
          </Button>
        </div>
      )}
      {providerOperation.submission.isError && (
        <p role="alert" className="text-destructive text-sm">
          {t('failed')}
        </p>
      )}
      {series && occurrence && (
        <div className="space-y-1">
          <Label>{t('scope')}</Label>
          <Select
            value={scope}
            disabled={frozen || submission.isPending}
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
          {createsFutureTail && (
            <p className="text-muted-foreground text-xs">
              {t('futureExceptionsReset')}
            </p>
          )}
        </div>
      )}
      <NativeRecurrenceFields
        draft={draft}
        setDraft={(value) => {
          setDraft(value);
          setInvalid(false);
        }}
        occurrenceOnly={!!series && scope === 'this'}
        disabled={frozen || submission.isPending}
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
            disabled={frozen || submission.isPending}
            onClick={() => submit('delete')}
          >
            {t('delete')}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={frozen || submission.isPending}
        >
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={frozen || submission.isPending}>
          {t(
            submission.isPending || providerOperation.pending
              ? 'saving'
              : 'save'
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
