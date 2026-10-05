import { createHash } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types/supabase';
import {
  CalendarRecurrenceAnchorSchema,
  CalendarRecurrenceRuleSchema,
  calendarAnchorAtSlot,
  expandCalendarRecurrence,
  inspectCalendarRecurrenceSlot,
  validateCalendarRecurrence,
} from '@tuturuuu/utils/calendar-recurrence';
import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import {
  decryptEventFromStorage,
  encryptEventForStorage,
  getWorkspaceKey,
} from '@/lib/workspace-encryption';
import {
  type CreateSeriesSchema,
  type MutateSeriesSchema,
  type StoredSeries,
  StoredSeriesSchema,
} from './schema';

export class CalendarSeriesError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string
  ) {
    super(message);
  }
}
export async function callSeries(
  supabase: TypedSupabaseClient,
  wsId: string,
  action: string,
  input: Record<string, unknown>,
  actorId?: string
) {
  const { data, error } = await supabase.rpc('calendar_series_operation', {
    p_ws_id: wsId,
    p_action: action,
    p_input: input as Json,
    p_actor_id: actorId,
  });
  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '42501'
          ? 403
          : error.code === '40001'
            ? 409
            : error.code === '22023'
              ? 400
              : error.code === '54000'
                ? 422
                : ['42883', 'PGRST202'].includes(error.code)
                  ? 503
                  : 500;
    throw new CalendarSeriesError(
      status === 500 ? 'Failed to access calendar series' : error.message,
      status,
      error.code
    );
  }
  return data;
}
export async function readSeries(
  supabase: TypedSupabaseClient,
  wsId: string,
  seriesId: string,
  actorId?: string
) {
  return StoredSeriesSchema.parse(
    await callSeries(supabase, wsId, 'read', { seriesId }, actorId)
  );
}
export async function hydrateSeries(series: StoredSeries) {
  if (
    (series.payload.is_encrypted ||
      series.exceptions.some((e) => e.payload?.is_encrypted === true)) &&
    !(await getWorkspaceKey(series.ws_id))
  )
    throw new CalendarSeriesError(
      'Calendar encryption key unavailable',
      503,
      'ENCRYPTION_UNAVAILABLE'
    );
  const payload = await decryptEventFromStorage(
    { id: series.id, ...series.payload },
    series.ws_id
  );
  const exceptions = await Promise.all(
    series.exceptions.map(async (e) => ({
      ...e,
      payload: e.payload
        ? await decryptEventFromStorage(
            {
              id: series.id,
              title: String(e.payload.title ?? ''),
              description: String(e.payload.description ?? ''),
              ...e.payload,
            },
            series.ws_id
          )
        : null,
    }))
  );
  return { ...series, payload, exceptions };
}
export async function createSeries(
  supabase: TypedSupabaseClient,
  wsId: string,
  input: z.infer<typeof CreateSeriesSchema>,
  actorId?: string
) {
  validateCalendarRecurrence(input.rule, input.anchor);
  // Native-only contract. Provider series use retained operation recovery, not best-effort duplicate writes.
  const intentHash = createHash('sha256')
    .update(JSON.stringify({ action: 'create', input }))
    .digest('hex');
  const receipt = await callSeries(
    supabase,
    wsId,
    'receipt',
    {
      requestId: input.requestId,
      intentHash,
    },
    actorId
  );
  if (receipt) return receipt;
  const payload = await encryptEventForStorage(wsId, input.event);
  return callSeries(
    supabase,
    wsId,
    'create',
    {
      requestId: input.requestId,
      intentHash,
      workspaceCalendarId: input.workspaceCalendarId ?? null,
      rule: input.rule,
      anchor: input.anchor,
      payload,
    },
    actorId
  );
}
export async function mutateSeries(
  supabase: TypedSupabaseClient,
  wsId: string,
  seriesId: string,
  input: z.infer<typeof MutateSeriesSchema>,
  action: 'update' | 'delete',
  actorId?: string
) {
  const intentHash = createHash('sha256')
    .update(JSON.stringify({ action, seriesId, input }))
    .digest('hex');
  const receipt = await callSeries(
    supabase,
    wsId,
    'receipt',
    {
      requestId: input.requestId,
      intentHash,
    },
    actorId
  );
  if (receipt) return receipt;
  const stored = await readSeries(supabase, wsId, seriesId, actorId);
  if (stored.revision !== input.expectedRevision)
    throw new CalendarSeriesError(
      'Series revision changed',
      409,
      'REVISION_CONFLICT'
    );
  const series = await hydrateSeries(stored);
  const payload =
    action === 'update'
      ? await encryptEventForStorage(wsId, {
          ...series.payload,
          ...input.event,
        })
      : undefined;
  const request: Record<string, unknown> = {
    ...input,
    seriesId,
    payload,
    intentHash,
  };
  delete request.event;
  let scope = input.scope;
  if (scope !== 'all') {
    const slot = inspectCalendarRecurrenceSlot({
      rule: series.rule,
      anchor: series.anchor,
      originalStartLocal: input.originalStartLocal!,
    });
    if (scope === 'future' && slot.precedingCount === 0) scope = 'all';
    else if (scope === 'future') {
      request.previousRule = slot.previousRule;
      request.rule = input.rule ?? slot.remainingRule;
      request.anchor = input.anchor ?? {
        ...series.anchor,
        startLocal: input.originalStartLocal!,
        endLocal: seriesEndAtSlot(series, input.originalStartLocal!),
      };
    }
    if (scope === 'this') {
      if (input.anchor && input.anchor.allDay !== series.anchor.allDay)
        throw new CalendarSeriesError(
          'Occurrence all-day mode must match its series',
          400,
          'INVALID_OCCURRENCE'
        );
      const retained = series.exceptions.find(
        (e) => e.originalStartLocal === input.originalStartLocal
      );
      request.exception = input.anchor
        ? {
            startLocal: input.anchor.startLocal,
            endLocal: input.anchor.endLocal,
          }
        : (retained?.exception ?? {});
      if (action === 'update' && retained?.payload)
        request.payload = await encryptEventForStorage(wsId, {
          ...series.payload,
          ...retained.payload,
          ...input.event,
        });
    }
  }
  request.scope = scope;
  if (scope === 'all') {
    request.rule = input.rule ?? series.rule;
    request.anchor = input.anchor ?? series.anchor;
    // Changing the generating pattern drops overrides that no longer describe valid slots.
    request.resetExceptions =
      JSON.stringify(request.rule) !== JSON.stringify(series.rule) ||
      JSON.stringify(request.anchor) !== JSON.stringify(series.anchor);
  }
  if (action === 'update' && scope !== 'this')
    validateCalendarRecurrence(
      CalendarRecurrenceRuleSchema.parse(request.rule),
      CalendarRecurrenceAnchorSchema.parse(request.anchor)
    );
  return callSeries(supabase, wsId, action, request, actorId);
}
function seriesEndAtSlot(series: StoredSeries, slot: string) {
  // Local wall-clock duration is preserved across DST; helper returns a validated slot anchor.
  return calendarAnchorAtSlot(series.anchor, slot).endLocal;
}
export async function expandSeriesList(
  raw: unknown,
  range: { from: string; to: string; limit: number }
) {
  const rows = z.array(StoredSeriesSchema).max(1000).parse(raw);
  const occurrences = [];
  for (const row of rows) {
    const series = await hydrateSeries(row);
    const expanded = expandCalendarRecurrence({
      rule: series.rule,
      anchor: series.anchor,
      from: range.from,
      to: range.to,
      limit: 1000,
      exceptions: series.exceptions.map((e) => ({
        originalStartLocal: e.originalStartLocal,
        ...e.exception,
      })),
    });
    if (expanded.truncated)
      throw new CalendarSeriesError(
        'Narrow the recurrence read range',
        422,
        'RANGE_TOO_LARGE'
      );
    for (const occurrence of expanded.occurrences) {
      const exception = series.exceptions.find(
        (e) => e.originalStartLocal === occurrence.originalStartLocal
      );
      occurrences.push({
        ...series.payload,
        ...exception?.payload,
        ...occurrence,
        id: uuidv5(occurrence.originalStartLocal, series.id),
        ws_id: series.ws_id,
        provider: 'tuturuuu' as const,
        source_calendar_id: series.workspace_calendar_id,
        seriesId: series.id,
        seriesRevision: series.revision,
        recurrence: series.rule,
      });
    }
  }
  occurrences.sort(
    (a, b) =>
      Date.parse(a.start_at) - Date.parse(b.start_at) ||
      a.id.localeCompare(b.id)
  );
  if (occurrences.length > range.limit)
    throw new CalendarSeriesError(
      'Narrow the recurrence read range',
      422,
      'RANGE_TOO_LARGE'
    );
  return occurrences;
}
