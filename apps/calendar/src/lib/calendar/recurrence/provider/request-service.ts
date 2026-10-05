import { createHash } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { calendarProviderDateTimeLocal } from '@tuturuuu/utils/calendar-recurrence';
import { z } from 'zod';
import { encryptEventForStorage } from '../../../workspace-encryption';
import { createSealedJournalCodec } from '../../google-color-operations/sealed-journal';
import { resolveCalendarSource } from '../../source-resolver';
import { type CalendarAuthToken, ensureValidToken } from '../../token-refresh';
import { seriesResult } from '../http';
import { CreateSeriesSchema, MutateSeriesSchema } from '../schema';
import {
  CalendarSeriesError,
  createSeries,
  hydrateSeries,
  mutateSeries,
  readSeries,
} from '../service';
import { providerFutureCreateMetadata } from './create-metadata';
import { executeProviderSeriesOperation } from './executor';
import { createSeriesProviderInspector } from './inspect';
import { googleSeriesPayload, graphSeriesPayload } from './payload';
import {
  type ProviderSeriesPlan,
  providerSeriesCreatePlan,
  providerSeriesMutationPlan,
} from './plan';
import {
  ProviderJournalBindingSchema,
  ProviderOperationInputSchema,
  ProviderPlanSchema,
} from './schema';
import {
  createProviderSeriesStore,
  type ProviderOperation,
  ProviderOperationSchema,
  providerSeriesRpc,
} from './store';
import { createSeriesProviderWriter } from './writer';

type Access = { sbAdmin: TypedSupabaseClient; wsId: string; userId: string };
const rpcArgs = (access: Access) => ({
  supabase: access.sbAdmin,
  wsId: access.wsId,
  actorId: access.userId,
});
export async function readProviderOperation(
  access: Access,
  operationId: string
) {
  return ProviderOperationSchema.parse(
    await providerSeriesRpc(rpcArgs(access), 'read', { id: operationId })
  );
}
export async function publicProviderOperation(operation: ProviderOperation) {
  return {
    operationId: operation.id,
    status: operation.phase === 'applied' ? 'applied' : 'pending',
    ...(operation.phase === 'applied'
      ? { result: await seriesResult(operation.result) }
      : {}),
  };
}
async function resolveSource(
  access: Access,
  connectionId: string,
  provider: 'google' | 'microsoft'
) {
  const source = await resolveCalendarSource({
    sbAdmin: access.sbAdmin,
    wsId: access.wsId,
    userId: access.userId,
    source: { provider, connectionId },
  });
  if (
    source.provider === 'tuturuuu' ||
    source.connectionId !== connectionId ||
    source.provider !== provider
  )
    throw new CalendarSeriesError(
      'Provider calendar source changed',
      409,
      'SOURCE_CHANGED'
    );
  const { data: connection, error } = await access.sbAdmin
    .from('calendar_connections')
    .select('auth_token_id,sync_outbound_enabled')
    .eq('ws_id', access.wsId)
    .eq('id', connectionId)
    .single();
  if (error)
    throw new CalendarSeriesError(
      'Calendar connection unavailable',
      503,
      'SOURCE_UNAVAILABLE'
    );
  if (!connection.sync_outbound_enabled || !connection.auth_token_id)
    throw new CalendarSeriesError(
      'Calendar outbound sync is disabled',
      403,
      'SOURCE_READ_ONLY'
    );
  const { data: token, error: tokenError } = await access.sbAdmin
    .from('calendar_auth_tokens')
    .select('*')
    .eq('id', connection.auth_token_id)
    .eq('ws_id', access.wsId)
    .eq('user_id', access.userId)
    .eq('provider', provider)
    .eq('is_active', true)
    .single();
  if (tokenError || !token)
    throw new CalendarSeriesError(
      'Calendar credentials unavailable',
      403,
      'SOURCE_UNAVAILABLE'
    );
  const refreshed = await ensureValidToken(
    access.sbAdmin,
    token as CalendarAuthToken
  );
  if (refreshed.error)
    throw new CalendarSeriesError(
      'Calendar credentials require reconnection',
      409,
      'SOURCE_RECONNECT'
    );
  return {
    ...source,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? source.refreshToken,
  };
}
export async function reserveProviderOperation(access: Access, raw: unknown) {
  const input = ProviderOperationInputSchema.parse(raw);
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  // Lookup first: an applied retry must not prepare against the new revision.
  let existing: ProviderOperation | null = null;
  try {
    existing = await readProviderOperation(access, input.requestId);
  } catch (error) {
    if (!(error instanceof CalendarSeriesError) || error.status !== 404)
      throw error;
  }
  if (existing) {
    if (existing.intent_hash !== hash)
      throw new CalendarSeriesError(
        'Provider request id reused',
        409,
        'REQUEST_CONFLICT'
      );
    return existing;
  }
  const source = await resolveSource(
    access,
    input.source.connectionId,
    input.source.provider
  );
  let nativeInput: Record<string, unknown>;
  let plan: ProviderSeriesPlan;
  if (input.action === 'create') {
    const native = CreateSeriesSchema.parse({
      requestId: input.requestId,
      rule: input.rule,
      anchor: input.anchor,
      event: input.event,
      workspaceCalendarId: source.workspaceCalendarId,
    });
    nativeInput = z.record(z.string(), z.unknown()).parse(
      await createSeries(access.sbAdmin, access.wsId, native, access.userId, {
        prepareOnly: true,
      })
    );
    plan = providerSeriesCreatePlan(input.requestId, {
      rule: input.rule,
      anchor: input.anchor,
      event: input.event,
    });
  } else {
    const stored = await readSeries(
      access.sbAdmin,
      access.wsId,
      input.seriesId,
      access.userId
    );
    const series = await hydrateSeries(stored);
    const binding = z
      .object({
        connection_id: z.uuid(),
        provider: z.enum(['google', 'microsoft']),
        calendar_id: z.string(),
        master_id: z.string(),
        etag: z.string(),
      })
      .parse(
        await providerSeriesRpc(rpcArgs(access), 'binding', {
          seriesId: input.seriesId,
        })
      );
    if (
      binding.connection_id !== source.connectionId ||
      binding.provider !== source.provider ||
      binding.calendar_id !== source.externalCalendarId
    )
      throw new CalendarSeriesError(
        'Provider series source changed',
        409,
        'SOURCE_CHANGED'
      );
    const inspector = createSeriesProviderInspector(source);
    const master = await inspector.master(binding.master_id);
    if (master.etag !== binding.etag)
      throw new CalendarSeriesError(
        'Provider series changed externally; synchronize before editing',
        409,
        'PROVIDER_REVISION_CONFLICT'
      );
    const native = MutateSeriesSchema.parse({
      requestId: input.requestId,
      expectedRevision: input.expectedRevision,
      scope: input.scope,
      originalStartLocal: input.originalStartLocal,
      event: input.event,
      rule: input.rule,
      anchor: input.anchor,
    });
    nativeInput = z
      .record(z.string(), z.unknown())
      .parse(
        await mutateSeries(
          access.sbAdmin,
          access.wsId,
          input.seriesId,
          native,
          input.action,
          access.userId,
          { prepareOnly: true }
        )
      );
    const current = {
      rule: series.rule,
      anchor: series.anchor,
      event: {
        title: String(series.payload.title),
        description: String(series.payload.description ?? ''),
        location: series.payload.location as string | null | undefined,
      },
    };
    plan = providerSeriesMutationPlan({
      ...input,
      current,
      operationId: input.requestId,
      binding: {
        provider: binding.provider,
        connectionId: binding.connection_id,
        calendarId: binding.calendar_id,
        masterId: binding.master_id,
        etag: master.etag,
      },
    });
    const futureCreate = plan.steps.find((step) => step.kind === 'create');
    if (futureCreate?.kind === 'create') {
      // Validate and retain all cloneable fields before reserving any trim.
      futureCreate.metadata = providerFutureCreateMetadata(
        binding.provider,
        master.event
      );
      if (
        futureCreate.metadata.provider === 'microsoft' &&
        input.event?.description !== undefined
      )
        delete futureCreate.metadata.fields.body;
    }
    const first = plan.steps[0]!;
    if (
      (first.kind === 'update' || first.kind === 'delete') &&
      first.target === 'occurrence'
    ) {
      const instance = await inspector.instance(
        binding.master_id,
        current,
        input.originalStartLocal!
      );
      first.instanceId = instance.instanceId;
      first.instanceETag = instance.instanceETag;
      if (first.kind === 'update') {
        const remote = instance.event;
        const event =
          source.provider === 'google'
            ? {
                title: String(remote.summary ?? ''),
                description: String(remote.description ?? ''),
                location: remote.location ?? null,
              }
            : {
                title: String(remote.subject ?? ''),
                description: String(remote.body?.content ?? ''),
                location: remote.location?.displayName ?? null,
              };
        first.snapshot.event = { ...event, ...input.event };
        if (!input.anchor) {
          const local = (value: {
            date?: string;
            dateTime?: string;
            timeZone?: string;
          }) =>
            value.date
              ? `${value.date}T00:00:00`
              : calendarProviderDateTimeLocal(
                  { dateTime: value.dateTime!, timeZone: value.timeZone },
                  series.rule.timeZone
                );
          first.snapshot.anchor = {
            startLocal: local(remote.start),
            endLocal: local(remote.end),
            allDay: series.anchor.allDay,
          };
        }
        nativeInput.exception = {
          startLocal: first.snapshot.anchor.startLocal,
          endLocal: first.snapshot.anchor.endLocal,
        };
        nativeInput.payload = await encryptEventForStorage(access.wsId, {
          ...series.payload,
          ...series.exceptions.find(
            (value) => value.originalStartLocal === input.originalStartLocal
          )?.payload,
          ...first.snapshot.event,
          ...input.event,
        });
      }
    }
  }
  for (const step of plan.steps) {
    if (step.kind === 'create' || step.kind === 'update') {
      if (source.provider === 'microsoft')
        graphSeriesPayload(
          step.snapshot,
          step.kind === 'update' && step.target === 'occurrence'
        );
      else
        googleSeriesPayload(
          step.snapshot,
          step.kind === 'update' && step.target === 'occurrence'
        );
    }
  }
  const binding = {
    wsId: access.wsId,
    actorId: access.userId,
    operationId: input.requestId,
    provider: source.provider,
    connectionId: source.connectionId,
    calendarId: source.externalCalendarId,
  };
  const codec = createSealedJournalCodec({
    binding: ProviderJournalBindingSchema,
    payload: ProviderPlanSchema,
    authorize: async () => {},
    workspace: (value) => value.wsId,
  });
  const journal = await codec.seal(binding, plan);
  return ProviderOperationSchema.parse(
    await providerSeriesRpc(rpcArgs(access), 'reserve', {
      id: input.requestId,
      connectionId: source.connectionId,
      seriesId: input.action === 'create' ? null : input.seriesId,
      nativeAction: input.action,
      nativeInput,
      intentHash: hash,
      journal,
      stepCount: plan.steps.length,
    })
  );
}
export async function executeRequestProviderOperation(
  access: Access,
  operationId: string
) {
  const operation = await readProviderOperation(access, operationId);
  if (operation.phase === 'applied') return publicProviderOperation(operation);
  const { data: connection, error } = await access.sbAdmin
    .from('calendar_connections')
    .select('provider')
    .eq('id', operation.connection_id)
    .eq('ws_id', access.wsId)
    .single();
  if (
    error ||
    !connection ||
    !['google', 'microsoft'].includes(connection.provider)
  )
    throw new CalendarSeriesError(
      'Provider connection unavailable',
      409,
      'SOURCE_UNAVAILABLE'
    );
  const source = await resolveSource(
    access,
    operation.connection_id,
    connection.provider as 'google' | 'microsoft'
  );
  const assertAuthorized = async () => {
    await readProviderOperation(access, operationId);
  };
  const codec = createSealedJournalCodec({
    binding: ProviderJournalBindingSchema,
    payload: ProviderPlanSchema,
    authorize: assertAuthorized,
    workspace: (value) => value.wsId,
  });
  const store = createProviderSeriesStore({
    ...rpcArgs(access),
    operationId,
    open: (stored) =>
      codec.open(
        {
          wsId: access.wsId,
          actorId: access.userId,
          operationId,
          provider: source.provider,
          connectionId: source.connectionId,
          calendarId: source.externalCalendarId,
        },
        stored.journal
      ),
  });
  try {
    const result = await executeProviderSeriesOperation(
      store,
      createSeriesProviderWriter({ source, authorize: assertAuthorized })
    );
    return {
      operationId,
      status: 'applied' as const,
      result: await seriesResult(result),
    };
  } catch (error) {
    if (
      error instanceof CalendarSeriesError &&
      [403, 404].includes(error.status)
    )
      throw error;
    // Never log SDK request objects or credentials. The durable journal remains
    // available for an authorized retry after rate limits or transport failures.
    return { operationId, status: 'pending' as const };
  }
}
