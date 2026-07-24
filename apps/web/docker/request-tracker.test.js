import http from 'node:http';
import { createRequire } from 'node:module';
import net from 'node:net';
import { expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const {
  INTERNAL_DRAIN_STATUS_HEADER,
  INTERNAL_DRAIN_STATUS_HEADER_VALUE,
  isDrainStatusPathRequest,
  isInternalDrainStatusRequestAllowed,
  isPrivateNetworkAddress,
} = require('./request-tracker.js');

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function createServer() {
  const server = http.createServer(async (request, response) => {
    if (request.url === '/slow') {
      await wait(50);
      response.end('ok');
      return;
    }

    if (request.url === '/api/health') {
      response.end('ok');
      return;
    }

    response.statusCode = 404;
    response.end('missing');
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP server address.');
  }

  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    url: `http://127.0.0.1:${address.port}`,
  };
}

function requestPath(baseUrl, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const base = new URL(baseUrl);
    let rawResponse = '';
    const socket = net.createConnection(
      {
        host: base.hostname,
        port: Number(base.port),
      },
      () => {
        const serializedHeaders = Object.entries(headers)
          .map(([name, value]) => `${name}: ${value}`)
          .join('\r\n');
        const requestHeaders = [
          `Host: ${base.host}`,
          'Connection: close',
          serializedHeaders,
        ]
          .filter(Boolean)
          .join('\r\n');

        socket.write(`GET ${path} HTTP/1.1\r\n${requestHeaders}\r\n\r\n`);
      }
    );

    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      rawResponse += chunk;
    });
    socket.on('error', reject);
    socket.on('end', () => {
      const [rawHead = '', ...bodyParts] = rawResponse.split('\r\n\r\n');
      const statusCode = Number(rawHead.split('\r\n')[0]?.split(' ')[1]);

      resolve({
        body: bodyParts.join('\r\n\r\n'),
        statusCode,
      });
    });
  });
}

test('request tracker reports in-flight requests and excludes health probes', async () => {
  const server = await createServer();

  try {
    const slowRequest = fetch(`${server.url}/slow`);

    let inflight = 0;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch(`${server.url}/__platform/drain-status`);
      const payload = await response.json();
      inflight = payload.inflightRequests;

      if (inflight > 0) {
        break;
      }

      await wait(10);
    }

    expect(inflight).toBe(1);

    await slowRequest;

    const response = await fetch(`${server.url}/__platform/drain-status`);
    const payload = await response.json();

    expect(payload.inflightRequests).toBe(0);

    await fetch(`${server.url}/api/health`);

    const afterHealthResponse = await fetch(
      `${server.url}/__platform/drain-status`
    );
    const afterHealthPayload = await afterHealthResponse.json();

    expect(afterHealthPayload.inflightRequests).toBe(0);
  } finally {
    await server.close();
  }
});

test('request tracker rejects spoofed non-canonical drain-status paths', async () => {
  const server = await createServer();

  try {
    const response = await requestPath(
      server.url,
      '/__platform\\drain-status',
      {
        [INTERNAL_DRAIN_STATUS_HEADER]: INTERNAL_DRAIN_STATUS_HEADER_VALUE,
      }
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toBe('missing');
  } finally {
    await server.close();
  }
});

test('request tracker accepts only explicit internal proxy drain-status probes', () => {
  expect(isPrivateNetworkAddress('172.18.0.5')).toBe(true);
  expect(isPrivateNetworkAddress('::ffff:172.18.0.5')).toBe(true);
  expect(isPrivateNetworkAddress('8.8.8.8')).toBe(false);

  expect(
    isInternalDrainStatusRequestAllowed({
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    })
  ).toBe(true);
  expect(
    isInternalDrainStatusRequestAllowed({
      headers: { [INTERNAL_DRAIN_STATUS_HEADER]: '1' },
      socket: { remoteAddress: '172.18.0.5' },
    })
  ).toBe(true);
  expect(
    isInternalDrainStatusRequestAllowed({
      headers: {},
      socket: { remoteAddress: '172.18.0.5' },
    })
  ).toBe(false);
  expect(
    isInternalDrainStatusRequestAllowed({
      headers: { [INTERNAL_DRAIN_STATUS_HEADER]: '1' },
      socket: { remoteAddress: '8.8.8.8' },
    })
  ).toBe(false);
});

test('request tracker requires the canonical raw drain-status request target', () => {
  expect(isDrainStatusPathRequest({ url: '/__platform/drain-status' })).toBe(
    true
  );
  expect(
    isDrainStatusPathRequest({ url: '/__platform/drain-status?probe=1' })
  ).toBe(true);
  expect(isDrainStatusPathRequest({ url: '/__platform\\drain-status' })).toBe(
    false
  );
});
