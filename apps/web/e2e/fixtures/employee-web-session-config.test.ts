import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';
import { it as test } from 'vitest';
import {
  command,
  resolveNextCli,
  stop,
  webSessionOrigin,
  webSessionStartCommand,
} from './employee-web-session-support';

test('Web start uses the app cwd without a second app directory argument', () => {
  const start = webSessionStartCommand(49152);
  assert.equal(
    path.resolve(start.cwd),
    fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
  );
  assert.deepEqual(start.args, [
    resolveNextCli(),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    '49152',
  ]);
});

test('fixture origin matches Next normalization and reaches its IPv4 loopback listener', async () => {
  let seenOrigin: string | undefined;
  let seenHost: string | undefined;
  const server = createServer((request, response) => {
    seenOrigin = request.headers.origin;
    seenHost = request.headers.host;
    response.writeHead(204).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const origin = webSessionOrigin(address.port);
    assert.equal(new URL(origin).hostname, 'localhost');
    const incoming = new NextRequest(`${origin}/api/restore`, {
      headers: { origin },
    });
    assert.equal(new URL(incoming.url).origin, origin);
    const response = await fetch(origin, {
      headers: { origin },
      signal: AbortSignal.timeout(2000),
    });
    assert.equal(response.status, 204);
    assert.equal(seenOrigin, origin);
    assert.equal(seenHost, new URL(origin).host);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
});

test('actual Next config loader selects source imports only with the app cwd', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'employee-config-cwd-'));
  const source = path.join(directory, 'source');
  const relativeWeb = path.relative(
    process.cwd(),
    webSessionStartCommand(49152).cwd
  );
  assert.equal(relativeWeb, path.join('apps', 'web'));
  const web = path.join(source, relativeWeb);
  mkdirSync(web, { recursive: true });
  mkdirSync(path.join(source, 'scripts'), { recursive: true });
  writeFileSync(
    path.join(source, 'scripts/owned.cjs'),
    "exports.marker='source'"
  );
  writeFileSync(
    path.join(web, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } })
  );
  writeFileSync(
    path.join(web, 'next.config.ts'),
    "import {marker} from '../../scripts/owned.cjs';export default {env:{SYNTHETIC_ORIGIN:marker}};"
  );
  const require = createRequire(new URL('../../package.json', import.meta.url));
  const loader = require.resolve('next/dist/server/config');
  const constants = require.resolve('next/constants');
  const worker = `
    let outbound=0;const deny=()=>{outbound++;throw new Error('Synthetic outbound forbidden')};
    require('node:net').Socket.prototype.connect=deny;globalThis.fetch=deny;
    console.log=console.error=console.warn=()=>{};
    require(${JSON.stringify(loader)}).default(require(${JSON.stringify(constants)}).PHASE_PRODUCTION_SERVER,${JSON.stringify(web)})
      .then(c=>process.stdout.write(JSON.stringify({origin:c.env.SYNTHETIC_ORIGIN,outbound})))
      .catch(e=>{process.stdout.write(JSON.stringify({origin:'failed',missingModule:e.code==='MODULE_NOT_FOUND',outbound}));process.exitCode=1});
  `;
  try {
    for (const cwd of [source, web]) {
      const child = command(
        process.execPath,
        ['-e', worker],
        {
          PATH: process.env.PATH,
          NODE_ENV: 'production',
          NEXT_TELEMETRY_DISABLED: '1',
        },
        cwd
      );
      let output = '';
      child.stdout.on('data', (bytes: Buffer) => {
        if (Buffer.byteLength(output) + bytes.length <= 1024)
          output += bytes.toString('utf8');
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      try {
        await once(child, 'close');
        const receipt = JSON.parse(output);
        if (cwd === source) {
          assert.equal(child.exitCode, 1);
          assert.deepEqual(receipt, {
            origin: 'failed',
            missingModule: true,
            outbound: 0,
          });
        } else {
          assert.equal(child.exitCode, 0);
          assert.deepEqual(receipt, { origin: 'source', outbound: 0 });
        }
      } finally {
        clearTimeout(timer);
        await stop(child);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
