import { createServer, type Server, type Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createDatabaseConfirmation } from './database-confirmation';
import { hyperdriveQuery } from './hyperdrive-query';
import type { SignInput } from './input';

// The real postgres.js client against endpoints that never answer a query:
// a closed port and a server that accepts and stays silent. Both must fail
// closed within the confirmation deadline.
let silent: Server;
let silentPort = 0;
let closedPort = 0;
const sockets = new Set<Socket>();

function listen(server: Server) {
  return new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

beforeAll(async () => {
  silent = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  silentPort = await listen(silent);
  const probe = createServer();
  closedPort = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
});

afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => silent.close(resolve));
});

const input = {
  transactionId: '00000000-0000-4000-8000-000000000001',
  client: '00000000-0000-4000-8000-000000000002',
  kid: 'saml-test-1',
} as SignInput;

function confirmationAt(port: number, pending: Promise<unknown>[]) {
  return createDatabaseConfirmation({
    timeoutMs: 300,
    query: hyperdriveQuery(
      {
        connectionString: `postgres://sso_signer:unused@127.0.0.1:${port}/postgres`,
      },
      (promise) => pending.push(promise)
    ),
  });
}

describe('Hyperdrive confirmation query', () => {
  it('refuses when the database refuses the connection', async () => {
    const pending: Promise<unknown>[] = [];
    const started = Date.now();
    expect(
      await confirmationAt(closedPort, pending).confirm(input, { fields: '' })
    ).toEqual({ ok: false, error: 'confirmation_unavailable' });
    expect(Date.now() - started).toBeLessThan(3_000);
    await Promise.all(pending);
  });

  it('refuses at the deadline when the database never answers, and closes', async () => {
    const pending: Promise<unknown>[] = [];
    const started = Date.now();
    expect(
      await confirmationAt(silentPort, pending).confirm(input, { fields: '' })
    ).toEqual({ ok: false, error: 'confirmation_unavailable' });
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
  });
});
