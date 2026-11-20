import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  allowed: true,
  signedIn: true,
  member: true,
  admin: vi.fn(),
  rpc: vi.fn(),
  hitWindows: vi.fn(),
}));

vi.mock('@tuturuuu/utils/abuse-guard/select', () => ({
  selectAbuseGuard: () => ({
    kind: 'durable-object',
    client: { hitWindows: state.hitWindows },
  }),
}));

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: state.admin,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({
    ok: state.member,
    error: state.member ? undefined : 'membership_missing',
  }),
  getPermissions: async () => ({ containsPermission: () => state.allowed }),
  getWorkspaceTier: async () => 'PLUS',
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'resolved-workspace',
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (...args: unknown[]) => Promise<Response>) =>
    (request: NextRequest, context: { params: { wsId: string } }) =>
      state.signedIn
        ? handler(
            request,
            { user: { id: 'current-actor' }, supabase: {} },
            context.params
          )
        : NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
}));

import { POST as issueStatusLink } from './[splitId]/status-links/route';
import { POST as contactBank } from './contact-bank/[contactId]/route';
import { GET, POST } from './route';

const id = '9abafaf3-e1ca-4fcf-8729-f3916b0c913b';
const person = 'b957a8f4-0a6a-4a27-a63a-8101089a1503';
const currency = { code: 'VND', minorDigits: 0 };
const params = { params: { wsId: 'personal' } };
const valid = {
  id,
  title: 'Lunch',
  currency,
  finalized: true,
  participants: [
    { kind: 'member', id: person, memberId: person, displayName: 'Alex' },
  ],
  expenses: [
    {
      label: 'Lunch',
      currency,
      attendeeIds: [person],
      lines: [
        {
          label: 'Lunch',
          amountMinor: 100,
          allocation: { kind: 'equal', participantIds: [person] },
        },
      ],
      payments: [{ participantId: person, amountMinor: 100 }],
    },
  ],
};

function request(method: 'GET' | 'POST', body?: string, splitId?: string) {
  const url = new URL(
    'https://example.test/api/v1/workspaces/personal/finance/bill-splits'
  );
  if (splitId !== undefined) url.searchParams.set('id', splitId);
  return new NextRequest(url, { method, body });
}

describe('Finance bill splits API', () => {
  beforeEach(() => {
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLITS', 'true');
    state.allowed = true;
    state.member = true;
    state.signedIn = true;
    state.admin
      .mockReset()
      .mockResolvedValue({ schema: () => ({ rpc: state.rpc }) });
    state.hitWindows.mockReset().mockResolvedValue({ ok: true });
    state.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses no admin store for disabled, anonymous, foreign and unauthorized requests', async () => {
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLITS', '');
    expect((await GET(request('GET'), params)).status).toBe(404);
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLITS', 'true');
    state.signedIn = false;
    expect((await GET(request('GET'), params)).status).toBe(401);
    state.signedIn = true;
    state.member = false;
    expect((await GET(request('GET'), params)).status).toBe(404);
    state.member = true;
    state.allowed = false;
    expect(
      (await POST(request('POST', JSON.stringify(valid)), params)).status
    ).toBe(403);
    expect(state.admin).not.toHaveBeenCalled();
  });

  it('scopes detail by actor and workspace and hides absent results from cache', async () => {
    const response = await GET(request('GET', undefined, id), params);
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(state.rpc).toHaveBeenCalledWith('read_finance_bill_splits', {
      p_ws_id: 'resolved-workspace',
      p_actor_id: 'current-actor',
      p_id: id,
    });
  });

  it('gates writes before quota work and fails closed when the guard is unavailable', async () => {
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLITS', '');
    expect(
      (await POST(request('POST', JSON.stringify(valid)), params)).status
    ).toBe(404);
    expect(state.hitWindows).not.toHaveBeenCalled();

    vi.stubEnv('ENABLE_FINANCE_BILL_SPLITS', 'true');
    state.hitWindows.mockRejectedValueOnce(new Error('Guard unavailable'));
    expect(
      (await POST(request('POST', JSON.stringify(valid)), params)).status
    ).toBe(503);
    expect(state.hitWindows).toHaveBeenCalledWith([
      {
        partition: 'finance-bill-splits:write:current-actor',
        windows: [
          { key: 'requests', algo: 'sliding', limit: 20, windowMs: 60_000 },
        ],
      },
    ]);
    expect(state.admin).not.toHaveBeenCalled();
  });

  it('requires the selected consent revision to issue a receiving QR link', async () => {
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLIT_STATUS_LINKS', 'true');
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLIT_CONTACT_BANKS', 'true');
    vi.stubEnv('FINANCE_BILL_SPLIT_STATUS_ORIGIN', 'https://example.test');
    const context = { params: { wsId: 'personal', splitId: id } };
    const body = { kind: 'issue', hours: 1, receivingParticipantId: person };

    expect(
      (await issueStatusLink(request('POST', JSON.stringify(body)), context))
        .status
    ).toBe(400);
    expect(state.admin).not.toHaveBeenCalled();

    state.rpc.mockResolvedValue({ data: id, error: null });
    const response = await issueStatusLink(
      request(
        'POST',
        JSON.stringify({ ...body, receivingConsentRevision: id })
      ),
      context
    );
    expect(response.status).toBe(201);
    expect(state.rpc).toHaveBeenCalledWith(
      'manage_finance_bill_split_link',
      expect.objectContaining({
        p_receiving_participant_id: person,
        p_expected_consent_revision: id,
      })
    );
  });

  it('allows the recorded holder to withdraw bank consent after losing Finance access', async () => {
    state.allowed = false;
    const context = { params: { wsId: 'personal', contactId: id } };
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLIT_CONTACT_BANKS', 'true');
    const read = await contactBank(
      request('POST', JSON.stringify({ kind: 'masked_read' })),
      context
    );
    expect(read.status).toBe(403);
    expect(state.admin).not.toHaveBeenCalled();

    vi.stubEnv('ENABLE_FINANCE_BILL_SPLITS', '');
    vi.stubEnv('ENABLE_FINANCE_BILL_SPLIT_CONTACT_BANKS', '');
    state.member = false;
    state.hitWindows.mockClear();
    const revoke = await contactBank(
      request('POST', JSON.stringify({ kind: 'revoke' })),
      context
    );
    expect(revoke.status).toBe(200);
    expect(state.hitWindows).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith(
      'withdraw_finance_contact_bank_account',
      {
        p_ws_id: 'resolved-workspace',
        p_actor_id: 'current-actor',
        p_contact_id: id,
      }
    );
  });

  it('stores a server-calculated ledger under the authorized actor and workspace', async () => {
    state.rpc.mockResolvedValue({ data: id, error: null });
    const response = await POST(request('POST', JSON.stringify(valid)), params);
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(state.rpc).toHaveBeenCalledWith(
      'create_finance_bill_split',
      expect.objectContaining({
        p_actor_id: 'current-actor',
        p_ws_id: 'resolved-workspace',
        p_id: id,
        p_ledger: expect.objectContaining({ totalMinor: 100 }),
      })
    );
  });

  it('rejects malformed JSON and caller-supplied confirmations and ledgers', async () => {
    expect((await POST(request('POST', '{'), params)).status).toBe(400);
    expect(
      (
        await POST(
          request('POST', JSON.stringify({ ...valid, confirmed: [] })),
          params
        )
      ).status
    ).toBe(400);
    expect(
      (
        await POST(
          request('POST', JSON.stringify({ ...valid, ledger: {} })),
          params
        )
      ).status
    ).toBe(400);
    expect(state.admin).not.toHaveBeenCalled();
  });

  it('reports a database idempotency conflict and preserves its private cache policy', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: 'PT409' } });
    const response = await POST(request('POST', JSON.stringify(valid)), params);
    expect(response.status).toBe(409);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
