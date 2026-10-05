import { createHash } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types/supabase';
import { calendarRecurrenceSlotBounds } from '@tuturuuu/utils/calendar-recurrence';
import { z } from 'zod';
import { encryptEventForStorage } from '../../../../workspace-encryption';
import {
  createSealedJournalCodec,
  SealedJournalSchema,
} from '../../../google-color-operations/sealed-journal';
import { SeriesEventSchema, StoredSeriesSchema } from '../../schema';
import { CalendarSeriesError, hydrateSeries } from '../../service';
import type { ProviderSeriesObservation } from './observation';

const BindingSchema = z.object({
  series_id: z.uuid(),
  ws_id: z.uuid(),
  connection_id: z.uuid(),
  provider: z.enum(['google', 'microsoft']),
  calendar_id: z.string(),
  master_id: z.string(),
  etag: z.string().nullable(),
  metadata_journal: SealedJournalSchema.nullable(),
  series: StoredSeriesSchema,
});
const MetadataBindingSchema = z
  .object({
    kind: z.literal('calendar-series-provider-metadata'),
    wsId: z.uuid(),
    actorId: z.uuid(),
    connectionId: z.uuid(),
    provider: z.enum(['google', 'microsoft']),
    calendarId: z.string(),
    masterId: z.string(),
  })
  .strict();
const MetadataSchema = z
  .object({
    master: z.record(z.string(), z.unknown()),
    exceptions: z.array(z.record(z.string(), z.unknown())).max(1000),
  })
  .strict();
export type InboundProviderAccess = {
  supabase: TypedSupabaseClient;
  wsId: string;
  actorId: string;
  connectionId: string;
  provider: 'google' | 'microsoft';
  calendarId: string;
  color?: string | null;
};
async function reconcileRpc(
  access: InboundProviderAccess,
  action: string,
  input: Record<string, unknown>
) {
  const { data, error } = await access.supabase.rpc(
    'calendar_provider_series_reconcile',
    {
      p_ws_id: access.wsId,
      p_actor_id: access.actorId,
      p_connection_id: access.connectionId,
      p_action: action,
      p_input: input as Json,
    }
  );
  if (error)
    throw new CalendarSeriesError(
      error.message,
      error.code === '42501'
        ? 403
        : error.code === 'P0002'
          ? 404
          : error.code === '22023'
            ? 400
            : 503,
      error.code
    );
  return data as unknown;
}
/** Capture the local binding before provider reads. Final publication compares
 * that exact ETag under the same lock as pending outbound-operation checks. */
export async function prepareInboundProviderConnection(
  access: InboundProviderAccess
) {
  const readBindings = async () => {
    const bindings = z
      .array(BindingSchema)
      .max(1000)
      .parse(await reconcileRpc(access, 'bindings', {}));
    if (
      bindings.some(
        (value) =>
          value.ws_id !== access.wsId ||
          value.connection_id !== access.connectionId ||
          value.provider !== access.provider ||
          value.calendar_id !== access.calendarId
      )
    )
      throw new RangeError('Provider binding source changed');
    return bindings;
  };
  const bindings = await readBindings();
  const byMaster = new Map(bindings.map((value) => [value.master_id, value]));
  const authorize = async () => {
    await readBindings();
  };
  const codec = createSealedJournalCodec({
    binding: MetadataBindingSchema,
    payload: MetadataSchema,
    authorize,
    workspace: (value) => value.wsId,
  });
  const metadataBinding = (masterId: string) => ({
    kind: 'calendar-series-provider-metadata' as const,
    wsId: access.wsId,
    actorId: access.actorId,
    connectionId: access.connectionId,
    provider: access.provider,
    calendarId: access.calendarId,
    masterId,
  });
  return {
    bindings,
    authorize,
    async publish(args: {
      observation: ProviderSeriesObservation;
      master: Record<string, unknown>;
      rawExceptions: Record<string, unknown>[];
      representedInstanceIds: string[];
      coverage?: { from: string; to: string };
    }) {
      const observed = args.observation;
      const binding = byMaster.get(observed.masterId);
      const previous = binding ? await hydrateSeries(binding.series) : null;
      const exceptions = new Map(
        observed.exceptions.map((value) => [value.originalStartLocal, value])
      );
      // Graph only proves cancellations within its complete calendarView range.
      // Carry retained cancellations outside that coverage, if still in the rule.
      if (args.coverage && previous) {
        for (const old of previous.exceptions) {
          if (
            !old.exception.cancelled ||
            exceptions.has(old.originalStartLocal)
          )
            continue;
          try {
            const slot = calendarRecurrenceSlotBounds({
              rule: observed.rule,
              anchor: observed.anchor,
              originalStartLocal: old.originalStartLocal,
            });
            if (
              Date.parse(slot.end) <= Date.parse(args.coverage.from) ||
              Date.parse(slot.start) >= Date.parse(args.coverage.to)
            )
              exceptions.set(old.originalStartLocal, old);
          } catch {
            /* Removed slots must not reappear after provider rule changes. */
          }
        }
      }
      if (exceptions.size > 1000)
        throw new RangeError('Provider exception snapshot exceeds bound');
      const event = SeriesEventSchema.parse({
        ...observed.event,
        color: binding?.series.payload.color ?? access.color ?? 'BLUE',
        locked: binding?.series.payload.locked ?? false,
      });
      const semantic = {
        ...observed,
        event,
        exceptions: [...exceptions.values()].sort((a, b) =>
          a.originalStartLocal.localeCompare(b.originalStartLocal)
        ),
      };
      const payload = await encryptEventForStorage(access.wsId, event);
      const encryptedExceptions = await Promise.all(
        semantic.exceptions.map(async (value) => ({
          ...value,
          payload: value.payload
            ? await encryptEventForStorage(access.wsId, {
                ...event,
                ...value.payload,
              })
            : null,
        }))
      );
      const metadataJournal = await codec.seal(
        metadataBinding(observed.masterId),
        { master: args.master, exceptions: args.rawExceptions }
      );
      await authorize();
      const result = z
        .object({
          status: z.enum(['applied', 'deferred']),
          series: StoredSeriesSchema.optional(),
        })
        .parse(
          await reconcileRpc(access, 'snapshot', {
            masterId: observed.masterId,
            expectedBindingETag: binding?.etag ?? null,
            etag: observed.etag,
            observationHash: createHash('sha256')
              .update(JSON.stringify(semantic))
              .digest('hex'),
            rule: observed.rule,
            anchor: observed.anchor,
            payload,
            exceptions: encryptedExceptions,
            metadataJournal,
            representedInstanceIds: [...new Set(args.representedInstanceIds)],
          })
        );
      return result.status;
    },
    async deleted(masterId: string) {
      const binding = byMaster.get(masterId);
      if (!binding) return 'absent' as const;
      return z
        .object({ status: z.enum(['deferred', 'deleted', 'absent']) })
        .parse(
          await reconcileRpc(access, 'deleted', {
            masterId,
            expectedBindingETag: binding.etag,
          })
        ).status;
    },
    async readRetainedMetadata(masterId: string) {
      const binding = byMaster.get(masterId);
      if (!binding?.metadata_journal) return null;
      return codec.open(metadataBinding(masterId), binding.metadata_journal);
    },
  };
}
