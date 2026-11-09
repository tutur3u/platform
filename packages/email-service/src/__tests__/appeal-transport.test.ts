import { describe, expect, it, vi } from 'vitest';
import {
  createSesAppealTransport,
  type AppealSesPort,
  type AccountSuppression,
} from '../appeal-ses';
import {
  appealBindingSchema,
  type ConfirmationInput,
} from '../appeal-transport';
import { confirmationContent } from '../appeal-template';
import { sendGrantedReport } from '../appeal-report';

const binding = appealBindingSchema.parse({
  grantId: '00000000-0000-4000-8000-000000000001',
  sourceAccountId: '111111111111',
  sourceRegion: 'us-east-1',
  accountId: '222222222222',
  region: 'us-east-1',
  identity: 'confirm@recovery.example.com',
  configurationSet: 'appeal-confirm',
  ipPool: 'appeal-transactional',
  purpose: 'workspace_report_reenable',
  confirmationOrigin: 'https://tuturuuu.com',
});

describe('grant-bound report routing', () => {
  async function reportFixture() {
    const f = fixture();
    const record = vi.fn(
      async (_id: string, _status: string, _messageId?: string) => {}
    );
    const claim = vi.fn(async () => '00000000-0000-4000-8000-000000000004');
    const authorize = vi.fn(async () => true);
    const report = {
      account_id: binding.accountId,
      region: binding.region,
      identity: 'reports@recovery.example.com',
      configuration_set: 'workspace-reports',
      ip_pool: 'workspace-report-pool',
      purpose: 'workspace_report' as const,
    };
    const message = {
      source: 'Approved workspace <source@example.com>',
      recipients: { to: [input.email] },
      content: { subject: 'Workspace report', html: '<p>Report</p>' },
      metadata: {
        wsId: input.wsId,
        templateType: 'periodic-user-report',
        entityType: 'periodic-report',
        entityId: input.appealId,
      },
    };
    const observed = await f.transport.lookupSuppression(input.email);
    if (observed.status !== 'eligible') throw new Error('fixture_not_eligible');
    f.sourceSuppression.mockClear();
    f.recoverySuppression.mockClear();
    const context = {
      expectedProviderGeneration: observed.generation,
      binding,
      reportBinding: report,
      appealId: input.appealId,
      queueId: '00000000-0000-4000-8000-000000000005',
      generation: 'local-generation',
      source: f.source,
      recovery: f.recovery,
      isActive: f.isActive,
      claim,
      authorize,
      record,
    };
    return { ...f, message, context, claim, authorize, record };
  }
  it('uses the approved report identity/configuration and records the actual message', async () => {
    const f = await reportFixture();
    expect(await sendGrantedReport(f.message, f.context)).toMatchObject({
      success: true,
      messageId: 'message-1',
    });
    expect(f.send.mock.calls[0]?.[0].input).toMatchObject({
      FromEmailAddress: 'reports@recovery.example.com',
      ConfigurationSetName: 'workspace-reports',
      Destination: { ToAddresses: [input.email] },
    });
    expect(f.record).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000004',
      'sent',
      'message-1'
    );
  });
  it('never turns the confirmation channel into a general sender', async () => {
    const f = await reportFixture();
    f.context.reportBinding.configuration_set = binding.configurationSet;
    expect(await sendGrantedReport(f.message, f.context)).toMatchObject({
      success: false,
    });
    expect(f.claim).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });
  it('refuses campaigns and extra recipients before reserving transport', async () => {
    const f = await reportFixture();
    f.message.metadata.templateType = 'campaign';
    expect(await sendGrantedReport(f.message, f.context)).toMatchObject({
      success: false,
    });
    f.message.metadata.templateType = 'periodic-user-report';
    f.message.recipients.to.push('other@example.com');
    expect(await sendGrantedReport(f.message, f.context)).toMatchObject({
      success: false,
    });
    expect(f.claim).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });
  it('refuses a reused queue claim and a revoked grant without fallback', async () => {
    const f = await reportFixture();
    f.claim.mockResolvedValue('');
    expect(await sendGrantedReport(f.message, f.context)).toMatchObject({
      success: false,
    });
    expect(f.send).not.toHaveBeenCalled();
    expect(f.sourceSuppression).not.toHaveBeenCalled();
    f.claim.mockResolvedValue('00000000-0000-4000-8000-000000000004');
    f.authorize.mockResolvedValue(false);
    expect(await sendGrantedReport(f.message, f.context)).toMatchObject({
      success: false,
    });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('retains UNKNOWN and performs only one external send', async () => {
    const f = await reportFixture();
    f.send.mockRejectedValue(new Error('response lost'));
    expect(await sendGrantedReport(f.message, f.context)).toMatchObject({
      success: false,
      deliveryOutcome: 'unknown',
    });
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.record).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000004',
      'unknown'
    );
  });
  it('reblocks a complaint observed after consent and before the first report lookup', async () => {
    const f = await reportFixture();
    f.sourceSuppression.mockResolvedValue({
      kind: 'suppressed',
      reason: 'COMPLAINT',
      updatedAt: '2026-11-09T01:00:00Z',
    });
    expect(await sendGrantedReport(f.message, f.context)).toMatchObject({
      success: false,
    });
    expect(f.send).not.toHaveBeenCalled();
    expect(f.record).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000004',
      'reblocked'
    );
  });

  it('refuses provider-generation changes between claim and effect', async () => {
    const f = await reportFixture();
    f.sourceSuppression
      .mockResolvedValueOnce({ kind: 'clear' })
      .mockResolvedValue({
        kind: 'suppressed',
        reason: 'COMPLAINT',
        updatedAt: '2026-11-09T00:00:00Z',
      });
    expect(await sendGrantedReport(f.message, f.context)).toMatchObject({
      success: false,
    });
    expect(f.send).not.toHaveBeenCalled();
  });
});
const input: ConfirmationInput = {
  appealId: '00000000-0000-4000-8000-000000000002',
  wsId: '00000000-0000-4000-8000-000000000003',
  email: 'recipient@example.com',
  workspaceName: 'Example workspace',
  url: 'https://tuturuuu.com/en/email-appeals#token=fixture',
  purpose: 'workspace_report_reenable',
  generation: 'local-generation',
  providerGeneration: '',
};

function fixture() {
  const sourceSuppression = vi
    .fn<() => Promise<AccountSuppression>>()
    .mockResolvedValue({ kind: 'clear' });
  const recoverySuppression = vi
    .fn<() => Promise<AccountSuppression>>()
    .mockResolvedValue({ kind: 'clear' });
  const send = vi
    .fn<AppealSesPort['send']>()
    .mockResolvedValue({ MessageId: 'message-1' });
  const source: AppealSesPort = {
    accountId: async () => binding.sourceAccountId,
    healthy: async () => true,
    qualifiedIdentity: async () => true,
    qualifiedConfiguration: async () => true,
    suppression: sourceSuppression,
    send,
  };
  const recovery: AppealSesPort = {
    ...source,
    accountId: async () => binding.accountId,
    suppression: recoverySuppression,
  };
  const isActive = vi.fn(async () => true);
  const authorizeDispatch = vi.fn(async () => true);
  const transport = createSesAppealTransport(binding, {
    source,
    recovery,
    isActive,
    authorizeDispatch,
  });
  return {
    source,
    recovery,
    sourceSuppression,
    recoverySuppression,
    send,
    isActive,
    authorizeDispatch,
    transport,
  };
}

async function prepared(f: ReturnType<typeof fixture>) {
  const result = await f.transport.lookupSuppression(input.email);
  if (result.status !== 'eligible') throw new Error('fixture_not_eligible');
  return { ...input, providerGeneration: result.generation };
}

describe('pinned confirmation transport', () => {
  it('requires a distinct account and exact HTTPS origin', () => {
    expect(
      appealBindingSchema.safeParse({
        ...binding,
        accountId: binding.sourceAccountId,
      }).success
    ).toBe(false);
    for (const confirmationOrigin of [
      'http://tuturuuu.com',
      'https://tuturuuu.com/path',
      'https://user@tuturuuu.com',
    ]) {
      expect(
        appealBindingSchema.safeParse({ ...binding, confirmationOrigin })
          .success
      ).toBe(false);
    }
  });
  it('pins account, sender, configuration, destination, and non-token feedback tags', async () => {
    const f = fixture();
    const request = await prepared(f);
    expect(await f.transport.sendConfirmation(request)).toEqual({
      status: 'accepted',
      messageId: 'message-1',
    });
    expect(f.send).toHaveBeenCalledTimes(1);
    const command = f.send.mock.calls[0]?.[0];
    expect(command?.input).toMatchObject({
      FromEmailAddress: binding.identity,
      ConfigurationSetName: binding.configurationSet,
      Destination: { ToAddresses: [input.email] },
      EmailTags: [
        { Name: 'appeal_id', Value: input.appealId },
        { Name: 'workspace_id', Value: input.wsId },
      ],
    });
    expect(command?.input.Content?.Simple?.Subject?.Data).toBe(
      'Confirm workspace report emails'
    );
  });
  it('does not send when actual account identity differs', async () => {
    const f = fixture();
    f.recovery.accountId = async () => '333333333333';
    expect((await f.transport.lookupSuppression(input.email)).status).toBe(
      'unknown'
    );
    expect(await f.transport.sendConfirmation(input)).toEqual({
      status: 'rejected',
    });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('denies paused accounts and unqualified sender/configuration', async () => {
    for (const key of [
      'healthy',
      'qualifiedIdentity',
      'qualifiedConfiguration',
    ] as const) {
      const f = fixture();
      f.recovery[key] = async () => false;
      expect((await f.transport.lookupSuppression(input.email)).status).toBe(
        'unknown'
      );
      expect(f.send).not.toHaveBeenCalled();
    }
  });
  it('retains complaint suppression in the recovery account', async () => {
    const f = fixture();
    f.recoverySuppression.mockResolvedValue({
      kind: 'suppressed',
      reason: 'COMPLAINT',
      updatedAt: '2026-11-09T00:00:00Z',
    });
    expect((await f.transport.lookupSuppression(input.email)).status).toBe(
      'blocked'
    );
    expect(await f.transport.sendConfirmation(input)).toEqual({
      status: 'rejected',
    });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('treats provider lookup uncertainty or errors as denial', async () => {
    for (const outcome of ['unknown', 'error']) {
      const f = fixture();
      if (outcome === 'error')
        f.sourceSuppression.mockRejectedValue(new Error('unavailable'));
      else f.sourceSuppression.mockResolvedValue({ kind: 'unknown' });
      expect((await f.transport.lookupSuppression(input.email)).status).toBe(
        'unknown'
      );
      expect(f.send).not.toHaveBeenCalled();
    }
  });
  it('preserves fresh hard-bounce information without deleting suppression', async () => {
    const f = fixture();
    f.sourceSuppression.mockResolvedValue({
      kind: 'suppressed',
      reason: 'BOUNCE',
      updatedAt: '2026-11-09T00:00:00Z',
    });
    expect(await f.transport.lookupSuppression(input.email)).toMatchObject({
      status: 'eligible',
      hardBounce: true,
      source: 'bounce',
    });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('refuses a new source event after the initial lookup', async () => {
    const f = fixture();
    const request = await prepared(f);
    f.sourceSuppression.mockResolvedValue({
      kind: 'suppressed',
      reason: 'COMPLAINT',
      updatedAt: '2026-11-09T00:00:00Z',
    });
    expect(await f.transport.sendConfirmation(request)).toEqual({
      status: 'rejected',
    });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('honors revocation of the durable dispatch claim and stop fence', async () => {
    for (const key of ['isActive', 'authorizeDispatch'] as const) {
      const f = fixture();
      const request = await prepared(f);
      f[key].mockResolvedValue(false);
      expect(await f.transport.sendConfirmation(request)).toEqual({
        status: 'rejected',
      });
      expect(f.send).not.toHaveBeenCalled();
    }
  });
  it('preserves an unknown provider response without retry or fallback', async () => {
    const f = fixture();
    const request = await prepared(f);
    f.send.mockRejectedValue(new Error('response lost'));
    expect(await f.transport.sendConfirmation(request)).toEqual({
      status: 'unknown',
    });
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it('requires a provider message identifier for accepted state', async () => {
    const f = fixture();
    const request = await prepared(f);
    f.send.mockResolvedValue({});
    expect(await f.transport.sendConfirmation(request)).toEqual({
      status: 'unknown',
    });
  });
  it('escapes workspace text and refuses a caller-selected link origin', () => {
    const content = confirmationContent(binding, {
      ...input,
      workspaceName: '<script>alert(1)</script>',
    });
    expect(content.Body.Html.Data).not.toContain('<script>');
    expect(() =>
      confirmationContent(binding, {
        ...input,
        url: 'https://evil.example/en/email-appeals#token=fixture',
      })
    ).toThrow();
  });
});
