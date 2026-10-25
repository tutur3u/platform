import { timingSafeEqual, X509Certificate } from 'node:crypto';
import { chmod, readFile } from 'node:fs/promises';
import { createServer, request as httpsRequest } from 'node:https';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import type { TLSSocket } from 'node:tls';
import {
  OPERATION_PATH,
  SECRETS_ORIGIN,
} from '../src/service/secrets-protocol';
import { check } from './local-roundtrip-capture';
import { command, ITEM } from './local-roundtrip-isolated';

export async function tlsBridge(
  directory: string,
  handle: (request: Request) => Promise<Response | null>,
  signal: AbortSignal
) {
  const keyPath = join(directory, 'server.key');
  const certPath = join(directory, 'server.crt');
  const generated = command(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=Passwords synthetic fixture',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ],
    directory
  );
  generated.stdout.fill(0);
  generated.stderr.fill(0);
  await chmod(keyPath, 0o600);
  await chmod(certPath, 0o600);
  const key = await readFile(keyPath);
  const cert = await readFile(certPath);
  const pinned = new X509Certificate(cert).raw;
  const sockets = new Set<Socket>();
  const jobs = new Set<Promise<void>>();
  let failed = false;
  let dropped = false;
  let requests = 0;
  let encrypted = 0;
  const actions: Array<{
    action: string;
    requestId: string;
    targetRequestId?: string;
  }> = [];
  const server = createServer(
    {
      key,
      cert,
      minVersion: 'TLSv1.2',
      handshakeTimeout: 5000,
      requestTimeout: 30000,
      headersTimeout: 5000,
      keepAliveTimeout: 1000,
      maxHeaderSize: 16384,
    },
    (incoming, outgoing) => {
      const work = async () => {
        const chunks: Buffer[] = [];
        let body: Buffer | undefined;
        let result: Buffer | undefined;
        try {
          check(
            (incoming.socket as TLSSocket).encrypted === true,
            'SERVER_TLS'
          );
          check(
            incoming.method === 'POST' && incoming.url === OPERATION_PATH,
            'TLS_ROUTE'
          );
          check(++requests <= 12, 'CLI_REQUEST_LIMIT');
          let size = 0;
          for await (const chunk of incoming) {
            size += chunk.length;
            check(size <= 32768, 'CLI_BODY_LIMIT');
            chunks.push(Buffer.from(chunk));
          }
          body = Buffer.concat(chunks);
          const input = JSON.parse(body.toString('utf8'));
          actions.push({
            action: input.action,
            requestId: input.requestId,
            ...(input.targetRequestId
              ? { targetRequestId: input.targetRequestId }
              : {}),
          });
          const headers = new Headers();
          for (const name of ['authorization', 'content-type', 'accept']) {
            const value = incoming.headers[name];
            if (typeof value === 'string') headers.set(name, value);
          }
          check(
            incoming.headers.origin === undefined &&
              incoming.headers.cookie === undefined,
            'CLI_HEADERS'
          );
          const response = await handle(
            new Request(`${SECRETS_ORIGIN}${OPERATION_PATH}`, {
              method: 'POST',
              headers,
              body: Uint8Array.from(body),
              signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
            })
          );
          check(response !== null, 'HANDLER_ROUTE');
          result = Buffer.from(await response.arrayBuffer());
          // Only lose the response after the REAL handler acknowledges the original put.
          if (input.action === 'put' && input.requestId === ITEM && !dropped) {
            check(
              response.ok && JSON.parse(result.toString('utf8')).ok === true,
              'COMMIT_BEFORE_LOSS'
            );
            dropped = true;
            incoming.socket.destroy();
            return;
          }
          outgoing.writeHead(
            response.status,
            Object.fromEntries(response.headers)
          );
          await new Promise<void>((resolve) => {
            outgoing.once('close', resolve);
            outgoing.end(result, resolve);
          });
        } catch {
          failed = true;
          outgoing.destroy();
        } finally {
          for (const chunk of chunks) chunk.fill(0);
          body?.fill(0);
          result?.fill(0);
        }
      };
      const job = work();
      jobs.add(job);
      void job.finally(() => jobs.delete(job));
    }
  );
  server.on('tlsClientError', () => {
    failed = true;
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.setTimeout(30000, (socket) => socket.destroy());
  const abort = () => {
    for (const socket of sockets) socket.destroy();
    server.close();
  };
  signal.addEventListener('abort', abort);
  try {
    check(!signal.aborted, 'FIXTURE_ABORTED');
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch {
    signal.removeEventListener('abort', abort);
    abort();
    server.close();
    key.fill(0);
    cert.fill(0);
    pinned.fill(0);
    throw new Error('TLS_LISTEN');
  }
  const address = server.address();
  check(address && typeof address === 'object', 'TLS_ADDRESS');
  const endpoint = `https://127.0.0.1:${address.port}`;

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    check(
      url.origin === endpoint &&
        url.pathname === OPERATION_PATH &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password &&
        request.method === 'POST',
      'CLI_ENDPOINT'
    );
    const payload = Buffer.from(await request.arrayBuffer());
    check(payload.length <= 32768, 'CLIENT_BODY_LIMIT');
    try {
      return await new Promise<Response>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const wipe = () => {
          for (const chunk of chunks) chunk.fill(0);
        };
        const req = httpsRequest(
          url,
          {
            method: 'POST',
            headers: Object.fromEntries(request.headers),
            agent: false,
            ca: cert,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2',
            signal: AbortSignal.any([
              signal,
              request.signal,
              AbortSignal.timeout(30000),
            ]),
          },
          (response) => {
            let size = 0;
            response.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > 65536) {
                req.destroy(new Error('TLS_RESPONSE_LIMIT'));
                return;
              }
              chunks.push(Buffer.from(chunk));
            });
            response.once('error', () => {
              wipe();
              reject(new Error('TLS_RESPONSE'));
            });
            response.once('end', () => {
              const body = Buffer.concat(chunks);
              try {
                const status = response.statusCode ?? 500;
                check(status < 300 || status >= 400, 'CLI_REDIRECT');
                const headers = new Headers();
                for (const [name, value] of Object.entries(response.headers))
                  if (typeof value === 'string') headers.set(name, value);
                resolve(
                  new Response(Uint8Array.from(body), { status, headers })
                );
              } catch {
                reject(new Error('TLS_RESPONSE'));
              } finally {
                body.fill(0);
                wipe();
              }
            });
          }
        );
        req.once('socket', (socket) => {
          const tls = socket as TLSSocket;
          tls.once('secureConnect', () => {
            const peer = tls.getPeerCertificate().raw;
            if (
              !tls.encrypted ||
              !tls.authorized ||
              !peer ||
              peer.length !== pinned.length ||
              !timingSafeEqual(peer, pinned)
            ) {
              req.destroy(new Error('CLIENT_TLS'));
              return;
            }
            encrypted++;
          });
        });
        req.once('error', () => {
          wipe();
          reject(new Error('TLS_REQUEST'));
        });
        req.end(payload);
      });
    } finally {
      payload.fill(0);
    }
  };
  return {
    endpoint,
    fetch,
    actions,
    counts: () => ({ requests, encrypted, dropped, failed }),
    async close() {
      signal.removeEventListener('abort', abort);
      abort();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await Promise.allSettled(jobs);
      key.fill(0);
      cert.fill(0);
      pinned.fill(0);
    },
  };
}
