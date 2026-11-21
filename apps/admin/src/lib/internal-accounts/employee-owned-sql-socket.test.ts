import { once } from 'node:events';
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmployeeOwnedSqlSocketGroup } from './employee-owned-sql-socket';

vi.mock('server-only', () => ({}));
const servers: Server[] = [];
const accepted = new Set<Socket>();
const clients = new Set<Socket>();
afterEach(async () => {
  for (const socket of [...accepted, ...clients]) socket.destroy();
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
    )
  );
  accepted.clear();
  clients.clear();
  servers.length = 0;
});
async function listener() {
  const server = createServer((socket) => {
    accepted.add(socket);
    socket.on('error', () => {});
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected owned loopback TCP endpoint');
  return { host: '127.0.0.1', port: address.port };
}
describe('exclusive employee SQL socket ownership (real loopback TCP, no PostgreSQL)', () => {
  it('opens no connection during construction and denies after retirement', async () => {
    const controller = new AbortController();
    const group = createEmployeeOwnedSqlSocketGroup(controller.signal);
    expect(group.ownedSocketCount).toBe(0);
    await group.destroyAndDrain();
    await expect(group.connect({ host: '127.0.0.1', port: 1 })).rejects.toThrow(
      'Employee SQL connection unavailable'
    );
    expect(group.ownedSocketCount).toBe(0);
  });
  it('destroys and awaits exact stalled socket close while preserving an unrelated live socket', async () => {
    const endpoint = await listener();
    const foreign = createConnection(endpoint);
    clients.add(foreign);
    await once(foreign, 'connect');
    const controller = new AbortController();
    const group = createEmployeeOwnedSqlSocketGroup(controller.signal);
    const owned = await group.connect(endpoint);
    clients.add(owned);
    let closed = false;
    owned.once('close', () => {
      closed = true;
    });
    expect(group.ownedSocketCount).toBe(1);
    controller.abort();
    await group.destroyAndDrain();
    expect(closed).toBe(true);
    expect(owned.destroyed).toBe(true);
    expect(group.ownedSocketCount).toBe(0);
    expect(foreign.destroyed).toBe(false);
    const receiver = [...accepted].find(
      (socket) => socket.remotePort === foreign.localPort
    );
    if (!receiver)
      throw new Error('Expected unrelated connection still accepted');
    const received = once(receiver, 'data');
    foreign.write('still-live');
    expect((await received)[0].toString()).toBe('still-live');
  });
  it('aborts a real connecting socket and drains it before returning', async () => {
    const endpoint = await listener();
    const controller = new AbortController();
    const group = createEmployeeOwnedSqlSocketGroup(controller.signal);
    const pending = group.connect(endpoint);
    expect(group.ownedSocketCount).toBe(1);
    controller.abort();
    await expect(pending).rejects.toThrow(
      'Employee SQL connection unavailable'
    );
    await group.destroyAndDrain();
    expect(group.ownedSocketCount).toBe(0);
  });
  it('rejects a second simultaneous socket before connection creation', async () => {
    const endpoint = await listener();
    const group = createEmployeeOwnedSqlSocketGroup(
      new AbortController().signal
    );
    const first = await group.connect(endpoint);
    clients.add(first);
    await expect(group.connect(endpoint)).rejects.toThrow(
      'Employee SQL connection unavailable'
    );
    expect(group.ownedSocketCount).toBe(1);
    await group.destroyAndDrain();
    expect(group.ownedSocketCount).toBe(0);
  });
});
