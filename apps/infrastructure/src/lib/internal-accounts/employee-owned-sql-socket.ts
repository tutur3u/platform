import 'server-only';
import { Socket } from 'node:net';

/** Owns only sockets created by this group; no shared pool or borrowed handle. */
export function createEmployeeOwnedSqlSocketGroup(signal: AbortSignal) {
  const sockets = new Set<Socket>();
  const closed: Promise<void>[] = [];
  let retired = signal.aborted;
  const unavailable = () => new Error('Employee SQL connection unavailable');
  const destroyOwned = () => {
    retired = true;
    for (const socket of sockets) socket.destroy();
  };
  signal.addEventListener('abort', destroyOwned, { once: true });
  return {
    async connect({
      host,
      port,
    }: {
      host: string;
      port: number;
    }): Promise<Socket> {
      if (
        retired ||
        signal.aborted ||
        sockets.size !== 0 ||
        !host ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
      )
        throw unavailable();
      const socket = new Socket();
      sockets.add(socket);
      // Prevent an unhandled socket error before the driver attaches its own listener.
      socket.on('error', () => {});
      closed.push(
        new Promise<void>((resolve) => {
          socket.once('close', () => {
            sockets.delete(socket);
            resolve();
          });
        })
      );
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          socket.removeListener('connect', connected);
          socket.removeListener('error', failed);
          socket.removeListener('close', failed);
        };
        const connected = () => {
          cleanup();
          resolve();
        };
        const failed = () => {
          cleanup();
          reject(unavailable());
        };
        socket.once('connect', connected);
        socket.once('error', failed);
        socket.once('close', failed);
        socket.connect({ host, port });
      });
      if (retired || signal.aborted || socket.destroyed) throw unavailable();
      return socket;
    },
    async destroyAndDrain(): Promise<void> {
      destroyOwned();
      await Promise.all(closed);
      signal.removeEventListener('abort', destroyOwned);
    },
    get ownedSocketCount() {
      return sockets.size;
    },
  };
}
