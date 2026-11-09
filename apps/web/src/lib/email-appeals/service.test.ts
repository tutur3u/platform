import { describe, expect, it, vi } from 'vitest';
import {
  AppealError,
  APPEAL_LIFETIME_MS,
  type AppealTokenBinding,
  hashAppealRecipient,
  hashAppealToken,
  issueAppealToken,
  verifyAppealToken,
} from './domain';
import {
  type AppealStore,
  bootstrapRecipientAppeal,
  confirmAppeal,
  previewAppeal,
  readRecipientAppeal,
  requestAppeal,
} from './service';
import type { AppealTransport } from './transport';

const wsId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const key = 'isolated-test-signing-key-32-bytes-minimum';
const now = 1_800_000_000_000;
const input = {
  wsId,
  actorId,
  email: 'member@example.com',
  reason: 'Mailbox repaired and receiving mail',
};
const recipient = { appealId: id, actorId, email: input.email };
const tokenBinding: AppealTokenBinding = {
  appealId: id,
  wsId,
  recipientHash: hashAppealRecipient(input.email),
  purpose: 'workspace_report_reenable',
  generation: 'local-generation',
  expiresAt: now + APPEAL_LIFETIME_MS,
};

function fixture(reason = 'ses_hard_bounce') {
  const state: { hash: string | null; status: string; generation: string } = {
    hash: null,
    status: 'waiting_recipient',
    generation: tokenBinding.generation,
  };
  const store: AppealStore = {
    request: vi.fn(async () => ({ id, status: 'waiting_recipient' })),
    recipientView: vi.fn(async () => ({
      id,
      ws_id: wsId,
      email: input.email,
      reason,
      expires_at: new Date(tokenBinding.expiresAt).toISOString(),
      workspace_name: 'Trusted Workspace',
      status: state.status,
      generation: state.generation,
    })),
    claimBootstrap: vi.fn(async (value) => {
      if (state.status !== 'waiting_recipient') return { status: 'invalid' };
      state.hash = value.tokenHash;
      state.status = 'verifying';
      return { status: 'verifying' };
    }),
    recordProviderStatus: vi.fn(async () => undefined),
    claimDelivery: vi.fn(async () => {
      if (
        state.status !== 'verifying' ||
        state.generation !== tokenBinding.generation
      )
        return { status: 'reblocked' };
      state.status = 'dispatching';
      return { status: 'dispatching' };
    }),
    markDelivery: vi.fn(async (_id, outcome) => {
      state.status = outcome;
    }),
    preview: vi.fn(async (hash) =>
      hash === state.hash && state.status === 'sent'
        ? {
            status: 'ready',
            email: input.email,
            workspace_name: 'Trusted Workspace',
          }
        : { status: 'invalid' }
    ),
    confirm: vi.fn(async (hash, claims) => {
      if (
        hash !== state.hash ||
        state.status !== 'sent' ||
        claims.generation !== state.generation
      )
        return { status: 'invalid' };
      state.status = 'confirmed';
      return { status: 'confirmed' };
    }),
  };
  const send = vi.fn<AppealTransport['sendConfirmation']>(async () => ({
    status: 'accepted',
    messageId: 'ses-message-1',
  }));
  const lookup = vi.fn<AppealTransport['lookupSuppression']>(async () => ({
    status: 'eligible',
    hardBounce: false,
    source: 'bounce',
    generation: 'provider-generation',
  }));
  const transport: AppealTransport = {
    binding: {
      grantId: id,
      sourceAccountId: '111111111111',
      sourceRegion: 'ap-southeast-1',
      accountId: '222222222222',
      region: 'ap-southeast-1',
      identity: 'recovery@tuturuuu.com',
      configurationSet: 'recipient-recovery',
      ipPool: 'recipient-recovery',
      purpose: 'workspace_report_reenable',
      confirmationOrigin: 'https://approved-origin.example',
    },
    lookupSuppression: lookup,
    sendConfirmation: send,
  };
  const dependencies = {
    store,
    key,
    now,
    getTransport: vi.fn(async (): Promise<AppealTransport | null> => transport),
    isEnabled: vi.fn(async () => true),
    checkMx: vi.fn(async () => true),
  };
  return { state, store, send, lookup, transport, dependencies };
}

async function sentToken(f: ReturnType<typeof fixture>) {
  expect(await bootstrapRecipientAppeal(recipient, f.dependencies)).toEqual({
    status: 'sent',
  });
  const delivered = f.send.mock.calls[0]?.[0];
  const url = new URL(delivered?.url ?? 'https://invalid.test');
  expect(url.origin).toBe('https://approved-origin.example');
  expect(url.search).toBe('');
  const token = new URLSearchParams(url.hash.slice(1)).get('token') ?? '';
  expect(token).not.toBe('');
  return token;
}

describe('recipient-initiated appeal orchestration', () => {
  it.each(['ses_hard_bounce', 'ses_complaint', 'ses_soft_bounce_threshold'])(
    'admin initiation for %s never contacts recipient or returns a token',
    async (reason) => {
      const f = fixture(reason);
      expect(await requestAppeal(input, { store: f.store })).toEqual({
        status: 'waiting_recipient',
        appealId: id,
        recipientRequestPath: `/en/email-appeals/request?appeal=${id}`,
      });
      expect(f.store.claimBootstrap).not.toHaveBeenCalled();
      expect(f.send).not.toHaveBeenCalled();
      expect(f.lookup).not.toHaveBeenCalled();
    }
  );
  it('derives trusted workspace/email from the stored appeal after identity binding', async () => {
    const f = fixture();
    expect(await readRecipientAppeal(recipient, f.dependencies)).toEqual({
      appealId: id,
      workspaceName: 'Trusted Workspace',
      email: input.email,
      purpose: 'workspace_reports',
      status: 'waiting_recipient',
    });
    expect(f.store.recipientView).toHaveBeenCalledWith(id, actorId);
    expect(f.dependencies.isEnabled).toHaveBeenCalledWith(wsId);
  });
  it('refuses a different verified address before flag, claim or provider reads', async () => {
    const f = fixture();
    await expect(
      bootstrapRecipientAppeal(
        { ...recipient, email: 'other@example.com' },
        f.dependencies
      )
    ).rejects.toMatchObject({ code: 'forbidden', message: 'forbidden' });
    expect(f.dependencies.isEnabled).not.toHaveBeenCalled();
    expect(f.store.claimBootstrap).not.toHaveBeenCalled();
    expect(f.lookup).not.toHaveBeenCalled();
  });
  it('sends one fully bound challenge, previews without consuming, and consumes only once', async () => {
    const f = fixture();
    const token = await sentToken(f);
    expect(verifyAppealToken(token, key, now)).toMatchObject(tokenBinding);
    expect(f.state.hash).toBe(hashAppealToken(token));
    expect(f.store.markDelivery).toHaveBeenCalledWith(
      id,
      'sent',
      'ses-message-1'
    );
    expect(f.store.claimDelivery).toHaveBeenCalledWith(
      id,
      f.transport.binding,
      'provider-generation'
    );
    expect(f.store.recordProviderStatus).toHaveBeenCalledWith(
      wsId,
      actorId,
      input.email,
      {
        account_id: f.transport.binding.sourceAccountId,
        region: f.transport.binding.sourceRegion,
        suppressed: true,
        reason: 'BOUNCE',
        provider_generation: 'provider-generation',
      }
    );
    expect(f.send).toHaveBeenCalledWith(
      expect.objectContaining({
        email: input.email,
        wsId,
        appealId: id,
        workspaceName: 'Trusted Workspace',
        generation: tokenBinding.generation,
        providerGeneration: 'provider-generation',
      })
    );
    expect(await previewAppeal(token, f.dependencies)).toEqual({
      status: 'ready',
      workspaceName: 'Trusted Workspace',
      email: input.email,
      purpose: 'workspace_reports',
    });
    expect(f.state.status).toBe('sent');
    expect(await confirmAppeal(token, f.dependencies)).toEqual({
      status: 'transport_pending',
    });
    await expect(confirmAppeal(token, f.dependencies)).rejects.toMatchObject({
      code: 'invalid_token',
      message: 'invalid_token',
    });
  });
  it('permits a complainant confirmation only after that exact recipient initiates it', async () => {
    const f = fixture('ses_complaint');
    await sentToken(f);
    expect(f.store.claimBootstrap).toHaveBeenCalledBefore(f.lookup);
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it.each(['blocked', 'unknown'] as const)(
    'denies exact provider suppression %s',
    async (status) => {
      const f = fixture();
      f.lookup.mockResolvedValue(
        status === 'unknown'
          ? { status, hardBounce: false }
          : {
              status,
              hardBounce: false,
              accountId: '222222222222',
              region: 'us-east-1',
              generation: 'fixture-provider-generation',
            }
      );
      expect(await bootstrapRecipientAppeal(recipient, f.dependencies)).toEqual(
        { status: 'unavailable' }
      );
      expect(f.store.claimDelivery).not.toHaveBeenCalled();
      expect(f.send).not.toHaveBeenCalled();
    }
  );
  it('fails closed when the provider inventory read errors', async () => {
    const f = fixture();
    f.lookup.mockRejectedValue(new Error('outage'));
    expect(await bootstrapRecipientAppeal(recipient, f.dependencies)).toEqual({
      status: 'unavailable',
    });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('claims bootstrap before transport lookup and audits missing configuration', async () => {
    const f = fixture();
    f.dependencies.getTransport.mockResolvedValue(null);
    expect(await bootstrapRecipientAppeal(recipient, f.dependencies)).toEqual({
      status: 'unavailable',
    });
    expect(f.state.status).toBe('unavailable');
    expect(f.store.claimBootstrap).toHaveBeenCalledBefore(
      f.dependencies.getTransport
    );
    expect(f.send).not.toHaveBeenCalled();
  });
  it('audits missing signing configuration without sending an unsigned token', async () => {
    const f = fixture();
    expect(
      await bootstrapRecipientAppeal(recipient, { ...f.dependencies, key: '' })
    ).toEqual({ status: 'unavailable' });
    expect(f.state.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(f.state.status).toBe('unavailable');
    expect(f.dependencies.getTransport).not.toHaveBeenCalled();
  });
  it('refuses a fresh hard-bounce MX failure before dispatch', async () => {
    const f = fixture();
    f.dependencies.checkMx.mockResolvedValue(false);
    await expect(
      bootstrapRecipientAppeal(recipient, f.dependencies)
    ).rejects.toMatchObject({
      code: 'deliverability_failed',
      message: 'deliverability_failed',
    });
    expect(f.state.status).toBe('failed');
    expect(f.send).not.toHaveBeenCalled();
  });
  it('rechecks provider/local event generations after slow MX work', async () => {
    const f = fixture();
    f.dependencies.checkMx.mockImplementation(async () => {
      f.state.generation = 'new-complaint';
      return true;
    });
    expect(await bootstrapRecipientAppeal(recipient, f.dependencies)).toEqual({
      status: 'unavailable',
    });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('refuses dispatch when a refreshed provider status changes the appeal generation', async () => {
    const f = fixture();
    f.store.recordProviderStatus = vi.fn(async () => {
      f.state.generation = 'new-provider-complaint';
    });
    expect(await bootstrapRecipientAppeal(recipient, f.dependencies)).toEqual({
      status: 'unavailable',
    });
    expect(f.store.recordProviderStatus).toHaveBeenCalledBefore(
      f.dependencies.checkMx
    );
    expect(f.store.claimDelivery).toHaveBeenCalledTimes(1);
    expect(f.send).not.toHaveBeenCalled();
  });
  it('denies dispatch when the durable provider-status refresh fails', async () => {
    const f = fixture();
    f.store.recordProviderStatus = vi.fn(async () => {
      throw new AppealError('store_unavailable');
    });
    await expect(
      bootstrapRecipientAppeal(recipient, f.dependencies)
    ).rejects.toMatchObject({
      code: 'store_unavailable',
      message: 'store_unavailable',
    });
    expect(f.store.claimDelivery).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });
  it('preserves UNKNOWN identity and never retries or replaces its hash', async () => {
    const f = fixture();
    f.send.mockResolvedValue({ status: 'unknown' });
    expect(await bootstrapRecipientAppeal(recipient, f.dependencies)).toEqual({
      status: 'unknown',
    });
    const originalHash = f.state.hash;
    expect(await bootstrapRecipientAppeal(recipient, f.dependencies)).toEqual({
      status: 'unknown',
    });
    expect(f.state.hash).toBe(originalHash);
    expect(f.store.claimBootstrap).toHaveBeenCalledTimes(1);
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it('does not retry an unexpected provider exception', async () => {
    const f = fixture();
    f.send.mockRejectedValue(new Error('lost response'));
    expect(await bootstrapRecipientAppeal(recipient, f.dependencies)).toEqual({
      status: 'unknown',
    });
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it('records explicit provider refusal as failed rather than sent', async () => {
    const f = fixture();
    f.send.mockResolvedValue({ status: 'rejected' });
    expect(await bootstrapRecipientAppeal(recipient, f.dependencies)).toEqual({
      status: 'unavailable',
    });
    expect(f.state.status).toBe('failed');
  });
  it.each(['rate_limited', 'cooldown', 'forbidden'] as const)(
    'stops on bootstrap %s without effects',
    async (code) => {
      const f = fixture();
      f.store.claimBootstrap = vi.fn(async () => {
        throw new AppealError(code);
      });
      await expect(
        bootstrapRecipientAppeal(recipient, f.dependencies)
      ).rejects.toMatchObject({ code, message: code });
      expect(f.lookup).not.toHaveBeenCalled();
      expect(f.send).not.toHaveBeenCalled();
    }
  );
  it('checks the bound workspace flag before bootstrap and again at confirmation', async () => {
    const f = fixture();
    f.dependencies.isEnabled.mockResolvedValue(false);
    await expect(
      bootstrapRecipientAppeal(recipient, f.dependencies)
    ).rejects.toMatchObject({ code: 'flag_disabled' });
    await expect(
      confirmAppeal(issueAppealToken(tokenBinding, key, now), f.dependencies)
    ).rejects.toMatchObject({
      code: 'flag_disabled',
      message: 'flag_disabled',
    });
    expect(f.store.claimBootstrap).not.toHaveBeenCalled();
    expect(f.store.confirm).not.toHaveBeenCalled();
  });
  it('refuses a token invalidated by a new complaint at confirmation', async () => {
    const f = fixture();
    const token = await sentToken(f);
    f.state.generation = 'new-complaint';
    await expect(confirmAppeal(token, f.dependencies)).rejects.toMatchObject({
      code: 'invalid_token',
      message: 'invalid_token',
    });
  });
});
