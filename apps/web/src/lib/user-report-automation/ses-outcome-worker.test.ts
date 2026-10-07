import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESEmailProvider } from '../../../../../packages/email-service/src/providers/ses';
import type { ProviderSendParams } from '../../../../../packages/email-service/src/types';
import { recipientWorkerFixture } from './recipient-worker-fixture';

const transport = vi.hoisted(() => ({
  send: vi.fn(),
  serviceSend: vi.fn(),
  configs: [] as Record<string, unknown>[],
}));
vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: class {
    constructor(config: Record<string, unknown>) {
      transport.configs.push(config);
    }
    send = transport.send;
  },
  SendRawEmailCommand: class {
    constructor(public input: unknown) {}
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
  GetSendQuotaCommand: class {},
}));
vi.mock('@tuturuuu/email-service', () => ({
  EmailService: {
    fromWorkspace: async () => ({ send: transport.serviceSend }),
  },
}));
vi.mock('@tuturuuu/users-core/reports/email-preview', () => ({
  loadReportEmailPreview: async () => ({
    html: '<p>Synthetic report</p>',
    approvalStatus: 'APPROVED',
  }),
}));
vi.mock('@/lib/email-blacklist', () => ({
  isEmailBlacklisted: async () => false,
}));
vi.mock('@/lib/email-unsubscribe', () => ({
  createEmailUnsubscribeUrl: () => 'https://example.com/unsubscribe',
}));
vi.mock('./access', () => ({
  resolvePeriodicReportEmailAccess: async () => ({ allowed: true }),
}));
vi.mock('./context', () => ({ loadScopedReportContext: vi.fn() }));
vi.mock('./generation', () => ({ generatePeriodicReportNarrative: vi.fn() }));
vi.mock('./schedule-reconciliation', () => ({
  reconcilePeriodicReportSchedules: async () => ({}),
}));

import { processPeriodicReportAutomation } from './processor';

function syntheticProvider() {
  return new SESEmailProvider({
    type: 'ses',
    accessKeyId: 'synthetic-key',
    secretAccessKey: 'synthetic-secret',
    region: 'us-east-1',
  });
}
const params: ProviderSendParams = {
  source: 'Synthetic <sender@example.com>',
  recipients: { to: ['synthetic@example.com'] },
  content: {
    html: '<p>Synthetic report</p>',
    subject: 'Synthetic monthly report',
    headers: { 'List-Unsubscribe': '<https://example.com/unsubscribe>' },
  },
};
async function process(f: ReturnType<typeof recipientWorkerFixture>) {
  await processPeriodicReportAutomation(f.client as never, 'worker-a');
}
describe('actual SES adapter and monthly worker unknown delivery outcome', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    transport.configs.length = 0;
    transport.send.mockReset();
    transport.serviceSend.mockReset();
    const provider = syntheticProvider();
    // Keep the actual provider result intact; the service boundary adds source.
    transport.serviceSend.mockImplementation((value: ProviderSendParams) =>
      provider.send({ ...value, source: params.source })
    );
  });
  afterEach(() => vi.useRealTimers());
  it.each([
    { data: null, error: { code: 'PGRST202' } },
    { data: null, error: { code: '42883' } },
    { data: false, error: null },
    { data: null, error: { code: 'XX000' } },
  ])('does not claim or dispatch before readiness %#', async (readiness) => {
    const f = recipientWorkerFixture({ readiness });
    expect(
      await processPeriodicReportAutomation(f.client as never, 'worker-a')
    ).toMatchObject({ processedEmails: 0, processedRuns: 0 });
    expect(f.rpcCalls).toEqual(['periodic_report_delivery_contract_ready']);
    expect(transport.send).not.toHaveBeenCalled();
    expect(f.queue.status).toBe('queued');
  });
  it('configures sends for one SDK attempt while quota validation retains its default policy', () => {
    expect(transport.configs.map((config) => config.maxAttempts)).toEqual([
      undefined,
      1,
    ]);
  });
  it.each(['raw', 'normal'])(
    'classifies actual %s dispatch with a valid receipt as accepted',
    async (mode) => {
      transport.send.mockResolvedValue({
        MessageId: 'synthetic-receipt',
        $metadata: { httpStatusCode: 200 },
      });
      const content =
        mode === 'raw'
          ? params.content
          : { ...params.content, headers: undefined };
      const result = await syntheticProvider().send({ ...params, content });
      expect(result).toMatchObject({
        success: true,
        deliveryOutcome: 'accepted',
        messageId: 'synthetic-receipt',
      });
      const command = transport.send.mock.calls[0]?.[0];
      expect(Boolean(command.input.RawMessage)).toBe(mode === 'raw');
    }
  );
  it.each([
    { MessageId: '', $metadata: { httpStatusCode: 200 } },
    { MessageId: 'invalid receipt', $metadata: { httpStatusCode: 200 } },
    { $metadata: { httpStatusCode: 200 } },
    { MessageId: 'synthetic-receipt' },
    { $metadata: { httpStatusCode: 503 } },
    { $metadata: { httpStatusCode: 408 } },
  ])('blocks a non-authoritative response receipt %#', async (response) => {
    transport.send.mockResolvedValue(response);
    const f = recipientWorkerFixture();
    await process(f);
    expect(f.queue.status).toBe('blocked');
    expect(f.queue.provider_message_id).toBeUndefined();
  });
  it('does not treat an arbitrary error name as a definitive service rejection', async () => {
    transport.send.mockRejectedValue(
      Object.assign(new Error('Private synthetic provider detail'), {
        name: 'MessageRejected',
      })
    );
    const result = await syntheticProvider().send(params);
    expect(result).toMatchObject({
      deliveryOutcome: 'unknown',
      error:
        'Email delivery outcome is unknown. Check provider logs before retrying.',
    });
    expect(JSON.stringify(result)).not.toContain('Private synthetic');
  });
  it('rejects failed pre-dispatch validation without issuing an SDK command', async () => {
    class InvalidContentProvider extends SESEmailProvider {
      protected async sanitizeHtml(): Promise<string> {
        throw new Error('Private synthetic validation detail');
      }
    }
    const provider = new InvalidContentProvider({
      type: 'ses',
      accessKeyId: 'synthetic-key',
      secretAccessKey: 'synthetic-secret',
      region: 'us-east-1',
    });
    const result = await provider.send(params);
    expect(transport.send).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      deliveryOutcome: 'rejected',
      error: 'Email validation failed before provider dispatch.',
    });
  });
  it('retains unknown outcome after an SDK command handoff without asserting provider acceptance', async () => {
    const handedOff: unknown[] = [];
    transport.send.mockImplementation(async (command) => {
      handedOff.push(command);
      throw Object.assign(new Error('Synthetic response timeout'), {
        name: 'TimeoutError',
      });
    });
    const result = await syntheticProvider().send(params);
    expect(handedOff).toHaveLength(1);
    expect(result.success).toBe(false);
    expect(result.messageId).toBeUndefined();
    expect(result).toMatchObject({ deliveryOutcome: 'unknown' });
  });
  it('blocks a response-lost delivery rather than automatically issuing another SDK command', async () => {
    transport.send.mockRejectedValue(
      Object.assign(new Error('Synthetic response timeout'), {
        name: 'TimeoutError',
      })
    );
    const f = recipientWorkerFixture();
    await process(f);
    const firstStatus = f.queue.status;
    vi.setSystemTime(new Date('2026-01-15T13:00:00Z'));
    await process(f);
    expect(transport.send).toHaveBeenCalledOnce();
    expect(firstStatus).toBe('blocked');
    expect(f.attempts[0]?.status).toBe('blocked');
  });
  it('retries a definitive throttling rejection after its scheduled deadline', async () => {
    transport.send.mockRejectedValue(
      Object.assign(new Error('Synthetic explicit throttling rejection'), {
        name: 'Throttling',
        $metadata: { httpStatusCode: 429 },
      })
    );
    const f = recipientWorkerFixture();
    await process(f);
    expect(f.queue.status).toBe('failed');
    await process(f);
    expect(transport.send).toHaveBeenCalledOnce();
    vi.setSystemTime(new Date('2026-01-15T13:00:00Z'));
    await process(f);
    expect(transport.send).toHaveBeenCalledTimes(2);
  });
  it('retains a successful actual adapter receipt and never resends a completed delivery', async () => {
    transport.send.mockResolvedValue({
      MessageId: 'synthetic-receipt',
      $metadata: { httpStatusCode: 200 },
    });
    const f = recipientWorkerFixture();
    await process(f);
    vi.setSystemTime(new Date('2026-01-15T13:00:00Z'));
    await process(f);
    expect(transport.send).toHaveBeenCalledOnce();
    expect(f.queue).toMatchObject({
      status: 'sent',
      provider_message_id: 'synthetic-receipt',
    });
  });
});
