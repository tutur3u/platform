import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recipientWorkerFixture } from './recipient-worker-fixture';

const mocks = vi.hoisted(() => ({ send: vi.fn(), preview: vi.fn() }));
vi.mock('@tuturuuu/email-service', () => ({
  EmailService: { fromWorkspace: async () => ({ send: mocks.send }) },
}));
vi.mock('@tuturuuu/users-core/reports/email-preview', () => ({
  loadReportEmailPreview: mocks.preview,
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

async function run(fixture: ReturnType<typeof recipientWorkerFixture>) {
  await processPeriodicReportAutomation(fixture.client as never, 'worker-a');
}
describe('actual monthly delivery worker recipient boundaries', () => {
  beforeEach(() => {
    mocks.send
      .mockReset()
      .mockResolvedValue({ success: true, messageId: 'synthetic-accepted' });
    mocks.preview.mockReset().mockResolvedValue({
      html: '<p>Synthetic report</p>',
      approvalStatus: 'APPROVED',
    });
  });
  it('sends a matching report to its current actor/workspace profile, not a stale queued address', async () => {
    const f = recipientWorkerFixture();
    await run(f);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.preview).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0]?.[0].recipients.to).toEqual([
      'current@example.com',
    ]);
    expect(
      f.calls.find((call) => call.table === 'workspace_users')?.filters
    ).toEqual([
      ['id', 'subject-a'],
      ['ws_id', 'workspace-a'],
    ]);
    expect(f.queue.recipient_email).toBe('current@example.com');
  });
  it('does not send a queued report whose current subject differs from the retained queue subject', async () => {
    // The existing authorized phased merge updates report.user_id before final
    // source-user deletion. The processing guard starts only after claim.
    const f = recipientWorkerFixture({ subjectId: 'replacement-a' });
    await run(f);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(f.queue.status).toBe('blocked');
    expect(f.completions[0]).toMatchObject({
      p_status: 'blocked',
      p_error: 'Report subject changed. Request a new delivery.',
    });
  });
  it('never resolves the same subject after it moves to another workspace', async () => {
    const f = recipientWorkerFixture({ profileWorkspace: 'workspace-b' });
    await run(f);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(
      f.calls.find((call) => call.table === 'workspace_users')?.filters
    ).toContainEqual(['ws_id', 'workspace-a']);
    expect(f.queue.status).toBe('failed');
  });
  it.each(['error', 'lost'] as const)(
    'does not resend provider-accepted mail after completion %s',
    async (completion) => {
      const f = recipientWorkerFixture({ completion });
      await run(f);
      await run(f);
      expect(mocks.send).toHaveBeenCalledOnce();
      expect(f.attempts[0]).toMatchObject({
        status: 'sent',
        provider_message_id: 'synthetic-accepted',
      });
      expect(f.completions[0]).toMatchObject({
        p_status: 'sent',
        p_provider_message_id: 'synthetic-accepted',
      });
      expect(f.queue.status).toBe('processing');
      if (completion === 'error')
        expect(f.completions.at(-1)).toMatchObject({
          p_status: 'blocked',
          p_provider_message_id: 'synthetic-accepted',
          p_sent_at: expect.any(String),
        });
    }
  );
  it('keeps provider acceptance terminal when the separate sent-email audit fails', async () => {
    const f = recipientWorkerFixture({ auditFailure: true });
    await run(f);
    await run(f);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(f.queue).toMatchObject({
      status: 'sent',
      provider_message_id: 'synthetic-accepted',
    });
    expect(f.report.delivery_status).toBe('sent');
  });
});
