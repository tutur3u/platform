import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, get } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { createLoopbackTlsFixture } from './runtime-fixture-crypto.mjs';

test('fixture trusts its certificate and verifies the loopback identity', async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'cms-fixture-tls-'));
  t.onTestFinished(() => rm(scratch, { recursive: true, force: true }));
  const { ca, httpsCertPath, httpsKeyPath } =
    await createLoopbackTlsFixture(scratch);
  assert.equal(await readFile(httpsCertPath, 'utf8'), ca);
  const server = createServer(
    { key: await readFile(httpsKeyPath), cert: ca },
    (request, response) => response.end(request.headers.host)
  );
  server.listen(0, '127.0.0.1');
  t.onTestFinished(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');

  const probe = (options) =>
    new Promise((resolve, reject) => {
      get(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          headers: { host: 'tuturuuu.com' },
          agent: false,
          servername: '',
          ...options,
        },
        async (response) => {
          try {
            const chunks = [];
            for await (const chunk of response) chunks.push(chunk);
            resolve(Buffer.concat(chunks).toString());
          } catch (error) {
            reject(error);
          }
        }
      ).on('error', reject);
    });

  assert.equal(await probe({ ca }), 'tuturuuu.com');
  await assert.rejects(probe({}), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  await assert.rejects(probe({ ca, servername: 'tuturuuu.com' }), {
    code: 'ERR_TLS_CERT_ALTNAME_INVALID',
  });
});
