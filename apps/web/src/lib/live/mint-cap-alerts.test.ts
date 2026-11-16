import { describe, expect, it, vi } from 'vitest';
vi.mock('@tuturuuu/email-service', () => ({ sendSystemEmail: vi.fn() }));
import {
  readLiveMintAlertRecipients,
  sendLiveMintBudgetAlert,
} from './mint-cap-alerts';

const event = {
  threshold: 80,
  day: '2026-11-16',
  reservedMicroUsd: 40_075_200,
  limitMicroUsd: 50_000_000,
} as const;

describe('Live budget alerts', () => {
  it('ships with an empty recipient list and explicitly reports unsent', async () => {
    const send = vi.fn();
    expect(readLiveMintAlertRecipients('[]')).toEqual([]);
    expect(
      await sendLiveMintBudgetAlert(event, { recipientConfig: '[]', send })
    ).toBe('unconfigured');
    expect(send).not.toHaveBeenCalled();
  });
  it.each([
    '["user@example.com"]',
    '["ops@tuturuuu.com.evil"]',
    '["ops@tuturuuu.com\\r\\nBcc:evil@example.com"]',
    '["Name <ops@tuturuuu.com>"]',
  ])('rejects foreign/header-injected recipients %s', (value) => {
    expect(() => readLiveMintAlertRecipients(value)).toThrow();
  });
  it('sends only to validated organization addresses through the existing service', async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ success: true, deliveryOutcome: 'accepted' });
    expect(
      await sendLiveMintBudgetAlert(event, {
        recipientConfig: '["Ops@TUTURUUU.COM","ops@tuturuuu.com"]',
        send,
      })
    ).toBe('accepted');
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      recipients: { to: ['ops@tuturuuu.com'] },
      metadata: { templateType: 'live-budget-alert' },
    });
  });
  it.each(['rejected', 'unknown'])(
    'does not retry a %s send',
    async (deliveryOutcome) => {
      const send = vi
        .fn()
        .mockResolvedValue({ success: false, deliveryOutcome });
      expect(
        await sendLiveMintBudgetAlert(event, {
          recipientConfig: '["ops@tuturuuu.com"]',
          send,
        })
      ).toBe(deliveryOutcome === 'unknown' ? 'unknown' : 'failed');
      expect(send).toHaveBeenCalledOnce();
    }
  );
  it('records a thrown/ambiguous send as unknown with no retry', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(new Error('unknown transport outcome'));
    expect(
      await sendLiveMintBudgetAlert(event, {
        recipientConfig: '["ops@tuturuuu.com"]',
        send,
      })
    ).toBe('unknown');
    expect(send).toHaveBeenCalledOnce();
  });
});
