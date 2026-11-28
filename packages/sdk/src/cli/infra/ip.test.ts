import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn());
vi.mock('../config', () => ({
  readCliConfig: async () => ({
    baseUrl: 'https://tuturuuu.com',
    session: { accessToken: 'fixture', refreshToken: 'fixture-refresh' },
  }),
}));
vi.mock('../account-group', () => ({
  getClient: () => ({ getClientOptions: () => ({ fetch: send }) }),
}));

import { runIpOperator } from './ip';

describe('ttr infra IP operator', () => {
  beforeEach(() => {
    send.mockReset();
  });

  it('sends one hosted mounted request and refuses redirects', async () => {
    send.mockResolvedValue(Response.json({ blocked: false }));
    const write = vi.fn();
    await runIpOperator(
      ['ip', 'unblock', '203.0.113.10'],
      new Map([
        ['reason', 'Fixed prober'],
        ['json', true],
      ]),
      write
    );
    expect(send).toHaveBeenCalledTimes(1);
    const [url, request] = send.mock.calls[0] ?? [];
    expect(url?.pathname).toBe('/admin/api/v1/infrastructure/blocked-ips');
    expect(request).toMatchObject({
      method: 'DELETE',
      redirect: 'error',
      body: JSON.stringify({
        ip_address: '203.0.113.10',
        reason: 'Fixed prober',
      }),
    });
    expect(write).toHaveBeenCalledWith('{"blocked":false}\n');
  });

  it.each([
    [404, 2],
    [403, 3],
  ])('maps HTTP %s to exit code %s', async (status, exitCode) => {
    send.mockResolvedValue(Response.json({}, { status }));
    await expect(
      runIpOperator(['ip', 'inspect', '203.0.113.10'], new Map(), vi.fn())
    ).rejects.toMatchObject({ exitCode });
  });

  it('rejects a missing reason without reaching the API', async () => {
    await expect(
      runIpOperator(['ip', 'unblock', '203.0.113.10'], new Map(), vi.fn())
    ).rejects.toMatchObject({ exitCode: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});
