import assert from 'node:assert/strict';
import test from 'node:test';
import { runOwnedSessionProcess } from './employee-web-session-process.mjs';

test('owned session captures bounded output and proves complete group exit', async () => {
  const result = await runOwnedSessionProcess(
    process.execPath,
    ['-e', 'process.stdout.write("receipt")'],
    {
      cwd: process.cwd(),
      input: '',
      timeoutMs: 1000,
    }
  );
  assert.deepEqual(result, {
    stdout: 'receipt',
    status: 0,
    processGroupStopped: true,
  });
});
test('timeout terminates a live fixture group and cannot accept a success-shaped receipt', async () => {
  const result = await runOwnedSessionProcess(
    process.execPath,
    ['-e', 'process.stdout.write("receipt");setInterval(()=>{},1000)'],
    {
      cwd: process.cwd(),
      input: '',
      timeoutMs: 100,
    }
  );
  assert.equal(result.status, null);
  assert.equal(result.processGroupStopped, true);
});
test('descendant surviving a successful leader is terminated before group cleanup qualifies', async () => {
  const result = await runOwnedSessionProcess(
    process.execPath,
    [
      '-e',
      'require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"}).unref();process.stdout.write("receipt")',
    ],
    {
      cwd: process.cwd(),
      input: '',
      timeoutMs: 1000,
    }
  );
  assert.equal(result.status, 0);
  assert.equal(result.processGroupStopped, true);
});
test('leader exit triggers cleanup when a descendant keeps stdout open', async () => {
  const started = Date.now();
  const result = await runOwnedSessionProcess(
    process.execPath,
    [
      '-e',
      'require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:["ignore",1,"ignore"]}).unref();process.stdout.write("receipt")',
    ],
    {
      cwd: process.cwd(),
      input: '',
      timeoutMs: 5000,
    }
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'receipt');
  assert.equal(result.processGroupStopped, true);
  assert.ok(Date.now() - started < 3000);
});
test('oversized receipt output fails closed and drains its owned process group', async () => {
  const result = await runOwnedSessionProcess(
    process.execPath,
    ['-e', 'process.stdout.write("x".repeat(8193))'],
    {
      cwd: process.cwd(),
      input: '',
      timeoutMs: 1000,
    }
  );
  assert.equal(result.stdout, '');
  assert.equal(result.status, null);
  assert.equal(result.processGroupStopped, true);
});

const buildControlOptions = { timeout: 30000 };
test(
  'owned builds drain on exit, crash and timeout',
  buildControlOptions,
  async () => {
    const fs = await import('node:fs');
    const { copyFileSync, mkdtempSync, readFileSync, existsSync, rmSync } = fs;
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const { randomUUID } = await import('node:crypto');
    const { createConnection } = await import('node:net');
    const { execFileSync } = await import('node:child_process');
    const bun = execFileSync(
      'bun',
      ['--no-install', '-e', 'process.stdout.write(process.execPath)'],
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    const moduleFiles = [
      'employee-web-session-process.mjs',
      'employee-web-session-build-diagnostic.mjs',
      'chat-initial-settings-qualification.mjs',
    ];
    const { pathToFileURL } = await import('node:url');
    for (const mode of [
      'leader-exit',
      'inner-timeout',
      'fixture-crash',
      'outer-timeout',
    ]) {
      const directory = mkdtempSync(
        path.join(tmpdir(), 'employee-owned-build-')
      );
      for (const file of moduleFiles) {
        copyFileSync(
          new URL(file, import.meta.url),
          path.join(directory, file)
        );
        assert.ok(
          readFileSync(path.join(directory, file)).equals(
            readFileSync(new URL(file, import.meta.url))
          )
        );
      }
      assert.equal(existsSync(path.join(directory, 'node_modules')), false);
      const helper = pathToFileURL(path.join(directory, moduleFiles[0])).href;
      const marker = path.join(directory, 'ready.json'),
        token = randomUUID();
      const jsLiteral = (value) =>
        JSON.stringify(value).replace(
          /[<>&/\u2028\u2029]/gu,
          (character) =>
            `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
        );
      const descendant = `process.on('SIGTERM',()=>{});const server=require('node:net').createServer();server.listen(0,'127.0.0.1',()=>require('node:fs').writeFileSync(${jsLiteral(marker)},JSON.stringify({pid:process.pid,port:server.address().port,token:${jsLiteral(token)}})));`;
      const leader = `const c=require('node:child_process').spawn(process.execPath,['-e',${jsLiteral(descendant)}],{stdio:['ignore',1,2]});c.unref();${mode === 'leader-exit' ? `const timer=setInterval(()=>{if(require('node:fs').existsSync(${jsLiteral(marker)})){clearInterval(timer);process.exit(7)}},10);` : "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);"}`;
      const worker = `import {runOwnedBuildProcess} from ${jsLiteral(helper)};const job=runOwnedBuildProcess('node',['-e',${jsLiteral(leader)}],{...process.env,PATH:${jsLiteral(path.dirname(process.execPath))}+':'+process.env.PATH},${mode === 'inner-timeout' ? 300 : 10000});${mode === 'fixture-crash' ? `const timer=setInterval(()=>{if(require('node:fs').existsSync(${jsLiteral(marker)})){clearInterval(timer);process.kill(process.pid,'SIGKILL')}},10);` : ''}try{const result=await job;console.log(JSON.stringify({exitCode:result.status,timedOut:result.timedOut}))}catch{console.log(JSON.stringify({controlFailure:'owned-build'}));process.exitCode=1}`;
      try {
        const started = Date.now();
        const result = await runOwnedSessionProcess(
          bun,
          ['--no-install', '-e', worker],
          {
            cwd: directory,
            timeoutMs: mode === 'outer-timeout' ? 1000 : 10000,
          }
        );
        assert.ok(existsSync(marker), JSON.stringify({ mode, ...result }));
        const identity = JSON.parse(readFileSync(marker, 'utf8'));
        assert.equal(identity.token, token);
        assert.equal(
          result.processGroupStopped,
          true,
          JSON.stringify({ mode, ...result })
        );
        assert.ok(Date.now() - started < 8000);
        if (mode === 'leader-exit') {
          assert.equal(result.status, 0);
          assert.deepEqual(JSON.parse(result.stdout), {
            exitCode: 7,
            timedOut: false,
          });
        }
        if (mode === 'fixture-crash') assert.equal(result.status, null);
        if (mode === 'inner-timeout') {
          assert.equal(result.status, 0);
          assert.equal(JSON.parse(result.stdout).timedOut, true);
        }
        if (mode === 'outer-timeout') assert.equal(result.status, null);
        await new Promise((resolve, reject) => {
          const socket = createConnection({
            host: '127.0.0.1',
            port: identity.port,
          });
          socket.once('connect', () => {
            socket.destroy();
            reject(new Error('Owned descendant port remains'));
          });
          socket.once('error', (error) =>
            error.code === 'ECONNREFUSED' ? resolve() : reject(error)
          );
        });
        assert.throws(() => process.kill(identity.pid, 0), { code: 'ESRCH' });
        for (const file of moduleFiles)
          assert.ok(
            readFileSync(path.join(directory, file)).equals(
              readFileSync(new URL(file, import.meta.url))
            )
          );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }
);

test('a fixture without its IPC owner cannot launch a detached build', async () => {
  const { execFileSync } = await import('node:child_process');
  const helper = new URL('./employee-web-session-process.mjs', import.meta.url)
    .href;
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {runOwnedBuildProcess} from ${jsLiteral(helper)};try{await runOwnedBuildProcess('node',['-e','process.exit(0)'],process.env,1000);console.log('unsafe')}catch{console.log('owner-required')}`,
    ],
    {
      env: { ...process.env, EMPLOYEE_WEB_SESSION_PROCESS_GROUP: '1' },
      encoding: 'utf8',
      timeout: 3000,
    }
  );
  assert.equal(output.trim(), 'owner-required');
});
