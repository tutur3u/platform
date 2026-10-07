import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  connection: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: handlers.connection }));
vi.mock('./get', () => ({ GET: handlers.get }));
vi.mock('./put', () => ({ PUT: handlers.put }));

import { GET, HEAD, PUT } from './route';

describe('first-class approvals facade', () => {
  beforeEach(() => vi.clearAllMocks());

  it('awaits request-time connection before forwarding GET arguments', async () => {
    let release!: () => void;
    handlers.connection.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    const request = new Request(
      'https://example.test/api/v1/workspaces/ws/users/approvals'
    );
    const context = { params: Promise.resolve({ wsId: 'ws' }) };
    const expected = new Response('items', { status: 200 });
    handlers.get.mockResolvedValue(expected);
    const response = GET(request, context);
    expect(handlers.get).not.toHaveBeenCalled();
    release();
    expect(await response).toBe(expected);
    expect(handlers.get).toHaveBeenCalledWith(request, context);
  });

  it('retains bodyless HEAD status and headers through the same GET boundary', async () => {
    handlers.connection.mockResolvedValue(undefined);
    handlers.get.mockResolvedValue(
      new Response('private error', {
        status: 403,
        headers: { 'x-contract': 'preserved' },
      })
    );
    const response = await HEAD(new Request('https://example.test'), {
      params: Promise.resolve({ wsId: 'ws' }),
    });
    expect(handlers.connection).toHaveBeenCalledOnce();
    expect(response?.status).toBe(403);
    expect(response?.headers.get('x-contract')).toBe('preserved');
    expect(await response?.text()).toBe('');
  });

  it('keeps the original Web PUT handler rather than substituting Contacts', () => {
    expect(PUT).toBe(handlers.put);
  });
});
