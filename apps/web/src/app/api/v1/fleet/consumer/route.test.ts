import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { POST as claim } from './claim/route';
import { POST as purge } from './purge/route';
import { POST as receipt } from './receipt/route';
import { POST as status } from './status/route';

const { rpc, admin } = vi.hoisted(() => {
  const rpc = vi.fn();
  return {
    rpc,
    admin: vi.fn(() => ({
      schema: (name: string) => {
        expect(name).toBe('private');
        return { rpc };
      },
    })),
  };
});

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: admin,
}));
vi.mock('@/lib/api-auth', () => ({ withSessionAuth: vi.fn() }));

const token = `ttr_fleet_consumer_${'a'.repeat(43)}`;
const slot = {
  slot: '2026-11-21T06:00:00.000Z',
  generation: '9007199254740993',
};
const receiptBody = {
  ...slot,
  id: 'bb000000-0000-4000-8000-000000000001',
  leaseId: 'bb000000-0000-4000-8000-000000000002',
  idempotencyKey: 'bb000000-0000-4000-8000-000000000003',
  state: 'dry_run',
};

function request(body: unknown, bearer = token) {
  return new Request('https://web.example.test/api/v1/fleet/consumer', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  admin.mockClear();
  rpc.mockReset();
  vi.stubEnv(
    'FLEET_CONSUMER_TOKEN_SHA256',
    createHash('sha256').update(token).digest('hex')
  );
});

afterEach(() => vi.unstubAllEnvs());

it.each([status, claim, receipt, purge])(
  'rejects other principals before opening the database',
  async (route) => {
    expect(
      (await route(request({}, `ttr_fleet_digest_${'a'.repeat(43)}`))).status
    ).toBe(401);
    expect(
      (await route(request({}, `ttr_fleet_consumer_${'b'.repeat(43)}`))).status
    ).toBe(401);
    expect(admin).not.toHaveBeenCalled();
  }
);

it('fails closed on missing verifier and oversized input', async () => {
  expect((await claim(request({ slot: 'x'.repeat(4096) }))).status).toBe(413);
  vi.stubEnv('FLEET_CONSUMER_TOKEN_SHA256', '');
  expect((await status(request({}))).status).toBe(503);
  expect(admin).not.toHaveBeenCalled();
});

it('rejects untyped or overprivileged consumer input before the RPC', async () => {
  expect((await claim(request({ ...slot, limit: 1000 }))).status).toBe(400);
  expect(
    (await receipt(request({ ...receiptBody, state: 'dispatched' }))).status
  ).toBe(400);
  expect(
    (await receipt(request({ ...receiptBody, approverId: receiptBody.id })))
      .status
  ).toBe(400);
  expect((await purge(request({ ...slot, generation: 1 }))).status).toBe(400);
  expect(admin).not.toHaveBeenCalled();
});

it('preserves precise stop generations and binds receipts to the private RPC', async () => {
  rpc.mockResolvedValue({ data: { state: 'dry_run' }, error: null });
  const response = await receipt(request(receiptBody));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ state: 'dry_run' });
  expect(admin).toHaveBeenCalledWith({ noCookie: true });
  expect(rpc).toHaveBeenCalledWith('fleet_consumer_receipt', {
    p_generation: slot.generation,
    p_slot: slot.slot,
    p_intent_id: receiptBody.id,
    p_lease_id: receiptBody.leaseId,
    p_idempotency_key: receiptBody.idempotencyKey,
    p_state: 'dry_run',
  });
});

it('uses discrete RPCs for status, claim and purge and preserves a stopped response', async () => {
  rpc.mockResolvedValue({ data: { state: 'stopped' }, error: null });
  expect(await (await status(request({}))).json()).toEqual({
    state: 'stopped',
  });
  expect(await (await claim(request(slot))).json()).toEqual({
    state: 'stopped',
  });
  expect(await (await purge(request(slot))).json()).toEqual({
    state: 'stopped',
  });
  expect(rpc.mock.calls).toEqual([
    ['fleet_consumer_status'],
    [
      'fleet_consumer_claim',
      { p_generation: slot.generation, p_slot: slot.slot },
    ],
    [
      'fleet_consumer_purge',
      { p_generation: slot.generation, p_slot: slot.slot },
    ],
  ]);
});

it('returns a generic unavailable response on database failure', async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { message: 'private diagnostics' },
  });
  vi.spyOn(console, 'error').mockImplementationOnce(() => undefined);
  const response = await purge(request(slot));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'fleet_unavailable' });
});
