import http from 'node:http';
import { expect, test } from 'vitest';

import './request-tracker.js';

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
