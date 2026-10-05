import type { createGraphClient } from '@tuturuuu/microsoft';
import { Effect } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import { CalendarSeriesError } from '../../service';
import type { InboundProviderAccess } from './service';

const identity = z.string().min(1).max(4096);
const eventSchema = z.object({
  id: identity,
  type: z.enum(['singleInstance', 'occurrence', 'exception', 'seriesMaster']),
  seriesMasterId: identity.optional().nullable(),
});
const batchSchema = z.object({
  responses: z
    .array(
      z.object({ id: z.string(), status: z.number().int(), body: z.unknown() })
    )
    .max(20),
});
const unavailable = () =>
  new CalendarSeriesError(
    'Provider legacy identity verification unavailable',
    503,
    'PROVIDER_IDENTITY_UNAVAILABLE'
  );

/** Legacy mutable instance IDs may outlive a fetched viewport. Verify each ID
 * against this exact calendar with immutable responses; never infer ownership
 * from dates, titles or a whole-calendar deletion. This bounded read-only repair
 * runs only while provider series admission is explicitly enabled. */
export async function verifyGraphLegacySeriesIdentities(args: {
  access: InboundProviderAccess;
  api: ReturnType<typeof createGraphClient>;
  masters: Set<string>;
  authorize: () => Promise<void>;
}) {
  const result = new Map<string, string[]>();
  if (!args.masters.size) return result;
  await args.authorize();
  const { data, error } = await args.access.supabase
    .from('workspace_calendar_events')
    .select('external_event_id')
    .eq('ws_id', args.access.wsId)
    .eq('provider', 'microsoft')
    .eq('external_calendar_id', args.access.calendarId)
    .not('external_event_id', 'is', null)
    .order('id')
    .limit(1001);
  if (error || !data || data.length > 1000) throw unavailable();
  const ids = [
    ...new Set(data.map((row) => identity.parse(row.external_event_id))),
  ];
  if (!ids.length) return result;
  await args.authorize();
  let translated: Map<string, string>;
  try {
    const response = z
      .object({
        value: z
          .array(z.object({ sourceId: identity, targetId: identity }))
          .max(1000),
      })
      .parse(
        await args.api.api('/me/translateExchangeIds').post({
          inputIds: ids,
          sourceIdType: 'restId',
          targetIdType: 'restImmutableEntryId',
        })
      );
    translated = new Map(
      response.value.map((row) => [row.sourceId, row.targetId])
    );
    if (
      response.value.length !== ids.length ||
      translated.size !== ids.length ||
      ids.some((id) => !translated.has(id))
    )
      throw unavailable();
  } catch {
    throw unavailable();
  }
  const batches: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += 20)
    batches.push(ids.slice(offset, offset + 20));
  const verified = await Effect.runPromise(
    Effect.either(
      Effect.forEach(
        batches,
        (batch) =>
          Effect.tryPromise({
            try: async () => {
              await args.authorize();
              const requests = batch.map((id, index) => ({
                id: String(index),
                method: 'GET',
                url: `/me/calendars/${encodeURIComponent(args.access.calendarId)}/events/${encodeURIComponent(translated.get(id)!)}?$select=id,type,seriesMasterId`,
                headers: { Prefer: 'IdType="ImmutableId"' },
              }));
              const response = batchSchema.parse(
                await args.api.api('/$batch').post({ requests })
              );
              if (
                response.responses.length !== batch.length ||
                new Set(response.responses.map((row) => row.id)).size !==
                  batch.length
              )
                throw unavailable();
              const linked: Array<{
                masterId: string;
                legacyId: string;
                immutableId: string;
              }> = [];
              for (const row of response.responses) {
                const index = requests.findIndex(
                  (request) => request.id === row.id
                );
                if (index < 0) throw unavailable();
                // Missing remote resources are not attributed to any master. Ordinary
                // inbound deletion policy handles them; they never authorize series cleanup.
                if (row.status === 404) continue;
                if (row.status !== 200) throw unavailable();
                const remote = eventSchema.parse(row.body);
                if (remote.id !== translated.get(batch[index]!))
                  throw unavailable();
                const masterId =
                  remote.type === 'seriesMaster'
                    ? remote.id
                    : ['occurrence', 'exception'].includes(remote.type)
                      ? remote.seriesMasterId
                      : null;
                if (masterId && args.masters.has(masterId))
                  linked.push({
                    masterId,
                    legacyId: batch[index]!,
                    immutableId: remote.id,
                  });
              }
              return linked;
            },
            catch: (failure) =>
              failure instanceof CalendarSeriesError ? failure : unavailable(),
          }),
        { concurrency: 3 }
      )
    )
  );
  if (verified._tag === 'Left') throw verified.left;
  for (const entry of verified.right.flat()) {
    const ids = result.get(entry.masterId) ?? [];
    ids.push(entry.legacyId);
    result.set(entry.masterId, ids);
  }
  return result;
}
