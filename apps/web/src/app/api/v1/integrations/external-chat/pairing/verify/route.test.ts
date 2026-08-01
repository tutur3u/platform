import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const consumeExternalChatPairingTicket = vi.fn();

vi.mock('@/lib/external-chat/crypto', () => ({
  hashExternalChatSecret: vi.fn(() => 'h'.repeat(64)),
}));
vi.mock('@/lib/external-chat/store', () => ({
  consumeExternalChatPairingTicket: (...args: unknown[]) =>
    consumeExternalChatPairingTicket(...args),
}));

function request(payload: unknown) {
  return new Request('http://localhost/pairing/verify', {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

describe('external chat pairing ticket verification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('consumes a valid ticket without returning it', async () => {
    consumeExternalChatPairingTicket.mockResolvedValue(true);
    const { POST } = await import('./route');
    const ticket = 'pairing-ticket-value-123456789';
    const response = await POST(
      request({
        bindingId: '11111111-1111-4111-8111-111111111111',
        ticket,
      })
    );

    expect(response.status).toBe(200);
    expect(consumeExternalChatPairingTicket).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'h'.repeat(64)
    );
    expect(await response.text()).toBe('{"valid":true}');
  });

  it('returns the same masked rejection for consumed or expired tickets', async () => {
    consumeExternalChatPairingTicket.mockResolvedValue(false);
    const { POST } = await import('./route');
    const ticket = 'expired-ticket-value-123456789';
    const response = await POST(
      request({
        bindingId: '11111111-1111-4111-8111-111111111111',
        ticket,
      })
    );

    expect(response.status).toBe(401);
    const responseText = await response.text();
    expect(responseText).toBe('{"error":"Unauthorized"}');
    expect(responseText).not.toContain(ticket);
  });

  it('rejects malformed requests without touching storage', async () => {
    const { POST } = await import('./route');
    const response = await POST(request({ bindingId: 'invalid', ticket: 'x' }));

    expect(response.status).toBe(401);
    expect(consumeExternalChatPairingTicket).not.toHaveBeenCalled();
  });
});
