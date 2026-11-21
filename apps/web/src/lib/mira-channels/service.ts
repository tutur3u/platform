import {
  MIRA_CHANNEL_KINDS,
  type MiraChannelKind,
  type MiraConnectError,
  type MiraConnectProof,
  miraConnectSchemas,
  miraSettingsPatchSchema,
  miraTenantStopSchema,
  miraUsageQuerySchema,
} from '@tuturuuu/internal-api/mira-channels';
import {
  bindMiraChannel,
  getMiraTenantRecord,
  listMiraUsage,
  MiraRpcError,
  type MiraRpcClient,
  readBackMiraStop,
  setMiraStopReason,
  unbindMiraChannelRecord,
  updateMiraTenantSettings,
} from '@tuturuuu/internal-api/mira-channels-rpc';
import { z } from 'zod';

// Tenant-side Mira channel operations behind the Web routes. Framework-free:
// the route adapter resolves the actor and permissions and injects the RPC
// client, the provider proof verifiers and the vault purger.

export type MiraTenantAction =
  | 'get'
  | 'settings'
  | 'stop'
  | 'connect'
  | 'unbind'
  | 'usage';

export interface MiraTenantActor {
  id: string;
  canView: boolean;
  canManage: boolean;
}

export type MiraProofOutcome =
  | {
      ok: true;
      mode: 'shared_bot' | 'bot' | 'official';
      providerAccountId: string;
      displayName: string;
    }
  | { ok: false; error: Exclude<MiraConnectError, 'already_bound'> };

/**
 * Verifies provider proof server-side and returns the provider account it
 * proves. A verifier never returns or logs the proof or provider text.
 */
export type MiraProofVerifier<K extends MiraChannelKind = MiraChannelKind> = (
  wsId: string,
  actorId: string,
  proof: MiraConnectProof<K>
) => Promise<MiraProofOutcome>;

export type MiraProofVerifiers = {
  [K in MiraChannelKind]?: MiraProofVerifier<K>;
};

/** Deletes the named vault variables of a channel before it is unbound. */
export type MiraSecretPurger = (
  wsId: string,
  channelId: string,
  secretNames: string[]
) => Promise<void>;

export interface MiraTenantDeps {
  rpc: MiraRpcClient;
  verifiers: MiraProofVerifiers;
  purgeSecrets: MiraSecretPurger | null;
  today: () => string;
}

export interface MiraTenantRequest {
  wsId: string;
  actor: MiraTenantActor;
  action: MiraTenantAction;
  body?: unknown;
  channel?: string;
  searchParams?: URLSearchParams;
}

export type MiraTenantResult = { status: number; body: unknown };

const ok = (body: unknown, status = 200): MiraTenantResult => ({
  status,
  body,
});
const fail = (error: string, status: number): MiraTenantResult => ({
  status,
  body: { error },
});

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function connect(
  deps: MiraTenantDeps,
  wsId: string,
  actorId: string,
  channel: string | undefined,
  body: unknown
): Promise<MiraTenantResult> {
  const kind = z.enum(MIRA_CHANNEL_KINDS).safeParse(channel);
  if (!kind.success) return fail('invalid_request', 400);
  const proof = miraConnectSchemas[kind.data].safeParse(body);
  if (!proof.success) return fail('invalid_proof', 400);
  const verify = deps.verifiers[kind.data] as MiraProofVerifier | undefined;
  if (!verify) return fail('connect_unavailable', 503);

  const outcome = await verify(wsId, actorId, proof.data);
  if (!outcome.ok) return fail(outcome.error, 400);
  try {
    const channelId = await bindMiraChannel(deps.rpc, {
      wsId,
      actorId,
      kind: kind.data,
      mode: outcome.mode,
      providerAccountId: outcome.providerAccountId,
      displayName: outcome.displayName,
    });
    return ok({ channelId }, 201);
  } catch (error) {
    if (error instanceof MiraRpcError && error.code === 'already_bound') {
      return fail('already_bound', 409);
    }
    throw error;
  }
}

async function unbind(
  deps: MiraTenantDeps,
  wsId: string,
  actorId: string,
  channel: string | undefined
): Promise<MiraTenantResult> {
  const channelId = z.guid().safeParse(channel);
  if (!channelId.success) return fail('invalid_request', 400);
  const tenant = await getMiraTenantRecord(deps.rpc, wsId);
  const record = tenant?.channels.find((c) => c.id === channelId.data);
  if (!record) return fail('not_found', 404);
  if (record.stopReasons.some((reason) => reason !== 'tenant')) {
    return fail('forbidden', 403);
  }
  if (record.secrets.length > 0) {
    if (!deps.purgeSecrets) return fail('vault_unavailable', 503);
    await deps.purgeSecrets(
      wsId,
      record.id,
      record.secrets.map((secret) => secret.name)
    );
  }
  const unbound = await unbindMiraChannelRecord(deps.rpc, {
    wsId,
    channelId: record.id,
    actorId,
  });
  return unbound ? ok({ unbound }) : fail('not_found', 404);
}

export async function runMiraTenantAction(
  deps: MiraTenantDeps,
  request: MiraTenantRequest
): Promise<MiraTenantResult> {
  const { action, actor, wsId } = request;
  const needsManage = action !== 'get' && action !== 'usage';
  if (needsManage ? !actor.canManage : !actor.canView) {
    return fail('mira_forbidden', 403);
  }

  try {
    switch (action) {
      case 'get':
        return ok({
          tenant: await getMiraTenantRecord(deps.rpc, wsId),
          canManage: actor.canManage,
        });
      case 'settings': {
        const parsed = miraSettingsPatchSchema.safeParse(request.body);
        if (!parsed.success) return fail('invalid_request', 400);
        return ok(
          await updateMiraTenantSettings(deps.rpc, {
            wsId,
            actorId: actor.id,
            ...parsed.data,
          })
        );
      }
      case 'stop': {
        const parsed = miraTenantStopSchema.safeParse(request.body);
        if (!parsed.success) return fail('invalid_request', 400);
        const channelId = parsed.data.channelId ?? null;
        const written = await setMiraStopReason(deps.rpc, {
          wsId,
          channelId,
          reason: 'tenant',
          stopped: parsed.data.stopped,
          actorId: actor.id,
          expectedGeneration: parsed.data.expectedGeneration,
          note: null,
        });
        return ok(await readBackMiraStop(deps.rpc, wsId, channelId, written));
      }
      case 'connect':
        return await connect(
          deps,
          wsId,
          actor.id,
          request.channel,
          request.body
        );
      case 'unbind':
        return await unbind(deps, wsId, actor.id, request.channel);
      case 'usage': {
        const to = request.searchParams?.get('to') ?? deps.today();
        const from = request.searchParams?.get('from') ?? addDays(to, -29);
        const parsed = miraUsageQuerySchema.safeParse({ from, to });
        if (!parsed.success) return fail('invalid_range', 400);
        return ok({
          ...parsed.data,
          rows: await listMiraUsage(deps.rpc, { wsId, ...parsed.data }),
        });
      }
    }
  } catch (error) {
    if (error instanceof MiraRpcError) {
      const { code, status } = error as MiraRpcError;
      return fail(code, status);
    }
    console.error('mira-channels: tenant request failed', { action });
    return fail('unavailable', 503);
  }
}
