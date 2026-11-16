import { createServer } from 'node:http';
import { NextRequest } from 'next/server';
import { expect, it } from 'vitest';
import { logoutSatelliteAppWithInternalApi } from '../../internal-api/src/auth-logout';
import { createAppOnlyLogoutHandlers } from './app-session';

it('receives app logout JSON through real HTTP transport instead of following a 303', async () => {
  const handlers = createAppOnlyLogoutHandlers({
    centralOrigin: 'https://tuturuuu.com',
  });
  let accept: string | undefined;
  let status: number | undefined;
  const server = createServer(async (incoming, outgoing) => {
    accept = incoming.headers.accept;
    const response = handlers.POST(
      new NextRequest('https://learn.tuturuuu.com/api/auth/logout', {
        method: 'POST',
        headers: {
          accept: accept ?? '',
          origin: 'https://tuturuuu.com',
          'sec-fetch-site': 'same-site',
        },
      })
    );
    status = response.status;
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.end(await response.text());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing loopback port');
    await expect(
      logoutSatelliteAppWithInternalApi({
        baseUrl: `http://127.0.0.1:${address.port}`,
      })
    ).resolves.toEqual({ success: true });
    expect(accept).toBe('application/json');
    expect(status).toBe(200);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
