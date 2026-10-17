import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { describe, it } from 'vitest';
import { runOwnedSessionProcess } from '../../../database/scripts/employee-web-session-process.mjs';
import { projectStartupDiagnostic } from '../../../database/scripts/employee-web-session-receipt.mjs';
import { waitForSessionReadiness } from './employee-web-session-readiness';
import { stop } from './employee-web-session-support';

const limits = { maxAttempts: 2, requestTimeoutMs: 40, intervalMs: 5 };
describe('actual finite loopback startup diagnostics', () => {
  for (const mode of [
    'ready',
    'status',
    'ok',
    'redirect',
    'connection',
    'timeout',
    'exit',
    'signal',
    'child-error',
  ]) {
    it(mode, async () => {
      let requests = 0;
      const server = createServer((_request, response) => {
        requests++;
        if (mode === 'timeout') return;
        response.writeHead(
          mode === 'ready'
            ? 401
            : mode === 'ok'
              ? 200
              : mode === 'redirect'
                ? 302
                : 503,
          {
            'set-cookie': 'private-cookie-must-not-survive',
            location: '/private-url-must-not-survive',
          }
        );
        response.end('private-body-must-not-survive');
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const endpoint = `http://127.0.0.1:${address.port}/private-path-must-not-survive`;
      if (mode === 'connection')
        await new Promise<void>((resolve) => server.close(() => resolve()));
      const child = spawn(
        mode === 'child-error'
          ? '/nonexistent-employee-synthetic-child'
          : process.execPath,
        [
          '-e',
          mode === 'exit' ? 'process.exit(7)' : 'setInterval(()=>{},1000)',
        ],
        { stdio: 'ignore' }
      );
      if (mode === 'exit') await once(child, 'exit');
      if (mode === 'signal') {
        child.kill('SIGTERM');
        await once(child, 'exit');
      }
      try {
        const result = await waitForSessionReadiness(child, endpoint, limits);
        const text = JSON.stringify(result);
        for (const secret of ['private-', endpoint, address.port.toString()])
          assert.ok(!text.includes(secret));
        if (mode === 'ready') {
          assert.equal(result.outcome, 'ready');
          assert.equal(result.status, 401);
          assert.equal(result.attempts, 1);
          assert.equal(requests, 1);
        } else if (mode === 'exit' || mode === 'signal') {
          assert.equal(result.outcome, 'child-exit');
          assert.equal(result.attempts, 0);
          assert.equal(result.exitCode, mode === 'exit' ? 7 : null);
          assert.equal(result.signal, mode === 'signal' ? 'SIGTERM' : null);
        } else if (mode === 'child-error') {
          assert.equal(result.outcome, 'child-error');
        } else {
          assert.equal(result.outcome, 'deadline');
          assert.equal(result.timedOut, true);
          assert.equal(result.attempts, 2);
          assert.equal(
            result.lastResult,
            mode === 'connection'
              ? 'connection-failure'
              : mode === 'timeout'
                ? 'request-timeout'
                : 'unexpected-status'
          );
          assert.equal(
            result.status,
            mode === 'status'
              ? 503
              : mode === 'ok'
                ? 200
                : mode === 'redirect'
                  ? 302
                  : null
          );
        }
      } finally {
        if (child.pid) await stop(child);
        if (server.listening) {
          const closed = new Promise<void>((resolve) =>
            server.close(() => resolve())
          );
          server.closeAllConnections();
          await closed;
        }
      }
    });
  }
});

it('pinned Bun actual fetch runtime retains only fixed startup observations', async () => {
  const { execFileSync } = await import('node:child_process');
  const bun = execFileSync(
    'bun',
    ['-e', 'process.stdout.write(process.execPath)'],
    {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }
  ).trim();
  const helper = new URL('./employee-web-session-readiness.ts', import.meta.url)
    .href;
  const script = `import {waitForSessionReadiness} from ${JSON.stringify(helper)};
import {createServer} from 'node:http';import {spawn} from 'node:child_process';import {once} from 'node:events';
const results=[];
for(const mode of ['ready','status','timeout','connection']){
const server=createServer((_q,r)=>{if(mode!=='timeout')r.writeHead(mode==='ready'?401:503).end('private-body');});
server.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
if(mode==='connection')await new Promise(r=>server.close(r));
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
try{results.push(await waitForSessionReadiness(child,url,{maxAttempts:2,requestTimeoutMs:40,intervalMs:5}));}
finally{child.kill();await once(child,'exit');if(server.listening){const done=new Promise(r=>server.close(r));server.closeAllConnections();await done;}}
}console.log(JSON.stringify(results));`;
  const result = await runOwnedSessionProcess(bun, ['-e', script], {
    cwd: process.cwd(),
    timeoutMs: 5000,
  });
  assert.equal(result.status, 0);
  assert.equal(result.processGroupStopped, true);
  const { z } = await import('zod');
  const values = z
    .array(z.unknown())
    .length(4)
    .parse(JSON.parse(result.stdout))
    .map(projectStartupDiagnostic);
  assert.deepEqual(
    values.map((v) => [v.outcome, v.lastResult, v.status]),
    [
      ['ready', 'ready', 401],
      ['deadline', 'unexpected-status', 503],
      ['deadline', 'request-timeout', null],
      ['deadline', 'connection-failure', null],
    ]
  );
});

it('readiness tuning cannot exceed production request and attempt bounds', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    stdio: 'ignore',
  });
  try {
    for (const limits of [
      { maxAttempts: 61 },
      { requestTimeoutMs: 1001 },
      { intervalMs: 501 },
    ]) {
      await assert.rejects(
        waitForSessionReadiness(child, 'http://127.0.0.1:1', limits),
        { message: 'Web startup limits invalid' }
      );
    }
  } finally {
    await stop(child);
  }
});
