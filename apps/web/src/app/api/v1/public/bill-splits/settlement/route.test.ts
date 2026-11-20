import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptBankAccount } from '@/lib/finance/bill-splits/contact-bank';
import { createStatusLinkToken } from '@/lib/finance/bill-splits/status-link';

const server = vi.hoisted(() => ({
  rpc: vi.fn(),
  quota: vi.fn(),
  tier: vi.fn(),
  subject: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ schema: () => ({ rpc: server.rpc }) }),
}));
vi.mock('@tuturuuu/utils/abuse-guard/public-admission', () => ({
  admitPublicRequest: server.quota,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceTier: server.tier,
}));

import { POST } from './route';

const origin = 'https://status.example.test';
const id = '9abafaf3-e1ca-4fcf-8729-f3916b0c913b';
const payer = 'b957a8f4-0a6a-4a27-a63a-8101089a1503';
const receiver = '7d31b995-dcc9-435b-bde3-587a31369c5b';
const link = {
  wsId: id,
  creatorId: id,
  splitId: id,
  participantId: payer,
  publicName: 'Trip guest',
};
const snapshot = {
  title: 'Private bill',
  currency: { code: 'VND', minorDigits: 0 },
  input: { direct: [], expenseSecret: 'item details' },
  ledger: {
    balances: [
      { participantId: payer, amountMinor: -200 },
      { participantId: receiver, amountMinor: 200 },
    ],
  },
  email: 'private@example.test',
  bankAccount: '987654321',
};

const token = createStatusLinkToken();
function request(requestOrigin = origin) {
  return new NextRequest(`${origin}/api/v1/public/bill-splits/settlement`, {
    method: 'POST',
    headers: { Origin: requestOrigin },
    body: JSON.stringify({ token }),
  });
}

describe('anonymous settlement status', () => {
  beforeEach(() => {
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLITS', 'true');
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLIT_STATUS_LINKS', 'true');
    vi.stubEnv('FINANCE_BILL_SPLIT_STATUS_ORIGIN', origin);
    server.rpc.mockReset();
    server.subject.mockReset().mockResolvedValue(true);
    server.quota.mockReset().mockResolvedValue({
      kind: 'admitted',
      admitVerifiedSubject: server.subject,
    });
    server.tier.mockReset().mockResolvedValue('PLUS');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('screens disabled, cross-origin and challenged requests before any lookup', async () => {
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLIT_STATUS_LINKS', 'false');
    expect((await POST(request())).status).toBe(404);
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLIT_STATUS_LINKS', 'true');
    expect((await POST(request('https://other.example.test'))).status).toBe(
      404
    );
    expect(server.quota).not.toHaveBeenCalled();
    server.quota.mockResolvedValue({ kind: 'challenge' });
    const challenged = await POST(request());
    expect(challenged.status).toBe(404);
    expect(challenged.headers.get('X-Abuse-Challenge')).toBe('turnstile');
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it('preserves the same denial on unknown links and downgraded workspaces', async () => {
    server.rpc.mockResolvedValue({ data: null });
    const unknown = await POST(request());
    expect(server.subject).not.toHaveBeenCalled();
    server.rpc.mockResolvedValue({ data: link });
    server.tier.mockResolvedValue('FREE');
    const downgraded = await POST(request());
    expect(downgraded.status).toBe(unknown.status);
    expect(await downgraded.json()).toEqual(await unknown.json());
    expect(server.rpc).toHaveBeenCalledTimes(2);
    expect(
      server.rpc.mock.calls.every(
        ([name]) => name === 'lookup_finance_bill_split_link'
      )
    ).toBe(true);
  });

  it('returns only the allowlisted status after applying confirmed partial payments', async () => {
    server.rpc
      .mockResolvedValueOnce({ data: link })
      .mockResolvedValueOnce({ data: [snapshot] })
      .mockResolvedValueOnce({
        data: [{ from: payer, to: receiver, amountMinor: 50 }],
      })
      .mockResolvedValueOnce({ data: link });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await response.json()).toEqual({
      status: 'outstanding',
      remainingTransfers: 1,
      currency: { code: 'VND', minorDigits: 0 },
      name: 'Trip guest',
      toPayMinor: '150',
      toReceiveMinor: '0',
    });
    expect(server.rpc.mock.calls.flatMap((call) => call)).not.toContain(token);
  });

  it.each([true, false])(
    'checks the issued consent revision for QR disclosure (active=%s)',
    async (active) => {
      const key = Buffer.alloc(32, 1);
      vi.stubEnv('ENABLE_FINANCE_BILL_SPLIT_CONTACT_BANKS', 'true');
      vi.stubEnv(
        'FINANCE_CONTACT_BANK_ENCRYPTION_KEY',
        key.toString('base64url')
      );
      const scoped = {
        ...link,
        receivingContactId: id,
        receivingParticipantId: receiver,
        receivingConsentRevision: payer,
      };
      server.rpc
        .mockResolvedValueOnce({ data: scoped })
        .mockResolvedValueOnce({ data: [snapshot] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: scoped })
        .mockResolvedValueOnce({
          data: {
            bankBin: '970436',
            encryptedDetails: encryptBankAccount(
              { holderName: 'Test Holder', accountNumber: '0001234567' },
              { wsId: id, contactId: id },
              key
            ),
          },
        })
        .mockResolvedValueOnce({ data: active ? scoped : null });

      const response = await POST(request());
      expect(server.rpc).toHaveBeenCalledWith('finance_contact_bank_command', {
        p_ws_id: id,
        p_actor_id: id,
        p_contact_id: id,
        p_action: 'public_qr',
        p_consent_revision: payer,
      });
      expect(response.status).toBe(active ? 200 : 404);
      const result = await response.json();
      if (active) expect(result.receivingQr).toEqual(expect.any(String));
      else expect(result).toEqual({ message: 'Status unavailable' });
    }
  );

  it('returns no projection after the link is revoked during redemption', async () => {
    server.rpc
      .mockResolvedValueOnce({ data: link })
      .mockResolvedValueOnce({ data: [snapshot] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: null });
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Status unavailable' });
  });
});
