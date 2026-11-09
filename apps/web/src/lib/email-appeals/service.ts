import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  AppealError,
  type AppealTokenBinding,
  appealRequestSchema,
  hashAppealRecipient,
  hashAppealToken,
  issueAppealToken,
  storedAppealReasonSchema,
  verifyAppealToken,
} from './domain';
import type { AppealTransport } from './transport';

export type AppealStore = {
  request(input: {
    wsId: string;
    actorId: string;
    email: string;
    reason: string;
    tokenHash: string;
  }): Promise<unknown>;
  recipientView(appealId: string, actorId: string): Promise<unknown>;
  claimBootstrap(input: {
    id: string;
    actorId: string;
    tokenHash: string;
    claims: AppealTokenBinding;
  }): Promise<unknown>;
  recordProviderStatus(
    wsId: string,
    actorId: string,
    email: string,
    status: {
      account_id: string;
      region: string;
      suppressed: boolean;
      reason?: 'BOUNCE' | 'COMPLAINT';
      provider_generation: string;
    }
  ): Promise<void>;
  claimDelivery(
    id: string,
    binding: AppealTransport['binding'],
    providerGeneration: string
  ): Promise<unknown>;
  markDelivery(
    id: string,
    outcome: 'sent' | 'failed' | 'unknown' | 'unavailable',
    messageId?: string
  ): Promise<void>;
  preview(tokenHash: string, claims: AppealTokenBinding): Promise<unknown>;
  confirm(tokenHash: string, claims: AppealTokenBinding): Promise<unknown>;
};

const initialSchema = z.object({
  id: z.uuid(),
  status: z.literal('waiting_recipient'),
});
const recipientSchema = z.object({
  id: z.uuid(),
  ws_id: z.uuid(),
  email: z.email(),
  reason: storedAppealReasonSchema,
  expires_at: z.string(),
  workspace_name: z.string().max(1000),
  generation: z.string().min(1).max(128),
  status: z.string(),
});
const stateSchema = z.object({ status: z.string() });
const previewSchema = z.object({
  status: z.literal('ready'),
  workspace_name: z.string(),
  email: z.email(),
});

function parseRecipient(value: unknown) {
  const parsed = recipientSchema.safeParse(value);
  if (!parsed.success) throw new AppealError('forbidden');
  return parsed.data;
}

export async function requestAppeal(
  input: {
    wsId: string;
    actorId: string;
    email: string;
    reason: string;
  },
  dependencies: { store: AppealStore }
) {
  const parsed = appealRequestSchema.safeParse({
    email: input.email,
    reason: input.reason,
  });
  if (!parsed.success) throw new AppealError('invalid_request');
  const result = initialSchema.safeParse(
    await dependencies.store.request({
      ...input,
      ...parsed.data,
      tokenHash: hashAppealToken(randomBytes(32).toString('base64url')),
    })
  );
  if (!result.success) throw new AppealError('store_unavailable');
  return {
    status: 'waiting_recipient' as const,
    appealId: result.data.id,
    recipientRequestPath: `/en/email-appeals/request?appeal=${result.data.id}`,
  };
}

export async function readRecipientAppeal(
  input: { appealId: string; actorId: string; email: string },
  dependencies: {
    store: AppealStore;
    isEnabled: (wsId: string) => Promise<boolean>;
  }
) {
  const row = parseRecipient(
    await dependencies.store.recipientView(input.appealId, input.actorId)
  );
  if (row.email !== input.email.trim().toLowerCase())
    throw new AppealError('forbidden');
  if (!(await dependencies.isEnabled(row.ws_id)))
    throw new AppealError('flag_disabled');
  return {
    appealId: row.id,
    workspaceName: row.workspace_name,
    email: row.email,
    purpose: 'workspace_reports' as const,
    status: row.status,
  };
}

export async function bootstrapRecipientAppeal(
  input: { appealId: string; actorId: string; email: string },
  dependencies: {
    store: AppealStore;
    key: string;
    getTransport: () => Promise<AppealTransport | null>;
    isEnabled: (wsId: string) => Promise<boolean>;
    checkMx: (email: string) => Promise<boolean>;
    now?: number;
  }
): Promise<{ status: 'sent' | 'unavailable' | 'unknown' }> {
  const row = parseRecipient(
    await dependencies.store.recipientView(input.appealId, input.actorId)
  );
  if (row.email !== input.email.trim().toLowerCase())
    throw new AppealError('forbidden');
  if (!(await dependencies.isEnabled(row.ws_id)))
    throw new AppealError('flag_disabled');
  if (row.status === 'unknown') return { status: 'unknown' };
  if (row.status !== 'waiting_recipient') return { status: 'unavailable' };
  const now = dependencies.now ?? Date.now();
  const claims: AppealTokenBinding = {
    appealId: row.id,
    wsId: row.ws_id,
    recipientHash: hashAppealRecipient(row.email),
    purpose: 'workspace_report_reenable',
    generation: row.generation,
    expiresAt: Date.parse(row.expires_at),
  };
  const canSign = Buffer.byteLength(dependencies.key) >= 32;
  const token =
    canSign && claims.expiresAt > now
      ? issueAppealToken(claims, dependencies.key, now)
      : randomBytes(32).toString('base64url');
  const bootstrap = stateSchema.safeParse(
    await dependencies.store.claimBootstrap({
      id: row.id,
      actorId: input.actorId,
      tokenHash: hashAppealToken(token),
      claims,
    })
  );
  if (!bootstrap.success) throw new AppealError('store_unavailable');
  if (bootstrap.data.status !== 'verifying') return { status: 'unavailable' };
  if (!canSign) {
    await dependencies.store.markDelivery(row.id, 'unavailable');
    return { status: 'unavailable' };
  }
  let transport: AppealTransport | null;
  try {
    transport = await dependencies.getTransport();
  } catch {
    transport = null;
  }
  if (!transport) {
    await dependencies.store.markDelivery(row.id, 'unavailable');
    return { status: 'unavailable' };
  }
  let suppression: Awaited<ReturnType<AppealTransport['lookupSuppression']>>;
  try {
    suppression = await transport.lookupSuppression(row.email);
  } catch {
    suppression = { status: 'unknown', hardBounce: false };
  }
  if (suppression.status !== 'eligible' || row.reason === 'manual') {
    await dependencies.store.markDelivery(row.id, 'failed');
    return { status: 'unavailable' };
  }
  await dependencies.store.recordProviderStatus(
    row.ws_id,
    input.actorId,
    row.email,
    {
      account_id: transport.binding.sourceAccountId,
      region: transport.binding.sourceRegion,
      suppressed: suppression.source !== 'clear',
      ...(suppression.source === 'bounce'
        ? { reason: 'BOUNCE' as const }
        : suppression.source === 'complaint'
          ? { reason: 'COMPLAINT' as const }
          : {}),
      provider_generation: suppression.generation,
    }
  );
  if (
    (row.reason === 'hard_bounce' || suppression.hardBounce) &&
    !(await dependencies.checkMx(row.email))
  ) {
    await dependencies.store.markDelivery(row.id, 'failed');
    throw new AppealError('deliverability_failed');
  }
  const claim = stateSchema.safeParse(
    await dependencies.store.claimDelivery(
      row.id,
      transport.binding,
      suppression.generation
    )
  );
  if (!claim.success) throw new AppealError('store_unavailable');
  if (claim.data.status !== 'dispatching') return { status: 'unavailable' };
  const url = new URL(
    '/en/email-appeals',
    transport.binding.confirmationOrigin
  );
  url.hash = new URLSearchParams({ token }).toString();
  let result: Awaited<ReturnType<AppealTransport['sendConfirmation']>>;
  try {
    result = await transport.sendConfirmation({
      appealId: row.id,
      wsId: row.ws_id,
      email: row.email,
      workspaceName: row.workspace_name,
      url: url.toString(),
      purpose: 'workspace_report_reenable',
      generation: row.generation,
      providerGeneration: suppression.generation,
    });
  } catch {
    result = { status: 'unknown' };
  }
  if (result.status === 'unknown') {
    await dependencies.store.markDelivery(row.id, 'unknown');
    return { status: 'unknown' };
  }
  if (result.status === 'rejected') {
    await dependencies.store.markDelivery(row.id, 'failed');
    return { status: 'unavailable' };
  }
  await dependencies.store.markDelivery(row.id, 'sent', result.messageId);
  return { status: 'sent' };
}

function bindingFromToken(
  token: string,
  key: string,
  now?: number
): AppealTokenBinding {
  const { nonce: _nonce, ...binding } = verifyAppealToken(token, key, now);
  return binding;
}

export async function previewAppeal(
  token: string,
  dependencies: {
    store: AppealStore;
    key: string;
    isEnabled: (wsId: string) => Promise<boolean>;
    now?: number;
  }
) {
  const claims = bindingFromToken(token, dependencies.key, dependencies.now);
  if (!(await dependencies.isEnabled(claims.wsId)))
    throw new AppealError('flag_disabled');
  const parsed = previewSchema.safeParse(
    await dependencies.store.preview(hashAppealToken(token), claims)
  );
  if (!parsed.success) throw new AppealError('invalid_token');
  return {
    status: 'ready' as const,
    workspaceName: parsed.data.workspace_name,
    email: parsed.data.email,
    purpose: 'workspace_reports' as const,
  };
}

export async function confirmAppeal(
  token: string,
  dependencies: {
    store: AppealStore;
    key: string;
    isEnabled: (wsId: string) => Promise<boolean>;
    now?: number;
  }
): Promise<{ status: 'transport_pending' }> {
  const claims = bindingFromToken(token, dependencies.key, dependencies.now);
  if (!(await dependencies.isEnabled(claims.wsId)))
    throw new AppealError('flag_disabled');
  const parsed = stateSchema.safeParse(
    await dependencies.store.confirm(hashAppealToken(token), claims)
  );
  if (!parsed.success) throw new AppealError('store_unavailable');
  if (parsed.data.status === 'expired') throw new AppealError('expired_token');
  if (parsed.data.status !== 'confirmed')
    throw new AppealError('invalid_token');
  return { status: 'transport_pending' };
}
