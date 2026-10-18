import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';
import { it as test } from 'vitest';
import { z } from 'zod';
import { runOwnedSessionProcess } from '../../../database/scripts/employee-web-session-process.mjs';
import {
  command,
  completeBuild,
  faultProxy,
  resolveNextCli,
  sessionFailure,
  sessionLifecycle,
  stop,
  webSessionBuildCommands,
} from './employee-web-session-support';

test('fault proxy forwards real loopback responses and drops exactly one successful update acknowledgement', async () => {
  let commits = 0;
  const target = '00000000-0000-4000-8000-000000000001';
  const upstream = createServer(async (request, response) => {
    for await (const _chunk of request) {
      /* Drain the request before committing. */
    }
    if (request.method === 'PUT') commits++;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ commits }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address !== 'string');
  const proxy = await faultProxy({
    url: `http://127.0.0.1:${address.port}`,
    key: 'synthetic-unused',
    anonKey: 'synthetic-unused',
    projectId: 'synthetic-unused',
    basePort: 12000,
    sourceSha: 'a'.repeat(40),
  });
  try {
    const url = `${proxy.url}/auth/v1/admin/users/${target}`;
    proxy.hideProviderAck(target);
    await assert.rejects(
      fetch(url, {
        method: 'PUT',
        body: '{}',
        signal: AbortSignal.timeout(1000),
      })
    );
    assert.equal(commits, 1);
    assert.deepEqual(proxy.counts(), { faults: 1, updates: 1 });
    const response = await fetch(url, {
      method: 'PUT',
      body: '{}',
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { commits: 2 });
    assert.deepEqual(proxy.counts(), { faults: 1, updates: 2 });
  } finally {
    await proxy.close();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('owned child stops and drains before cleanup reports success', async () => {
  const child = command(
    'node',
    ['-e', 'setInterval(() => {}, 1000)'],
    process.env
  );
  await once(child, 'spawn');
  await stop(child);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
  await stop(child);
});

test('Next CLI resolves from Web package context with no root Next dependency', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'employee-next-resolution-'));
  try {
    const web = path.join(root, 'apps/web');
    const cli = path.join(web, 'node_modules/next/dist/bin/next');
    mkdirSync(path.dirname(cli), { recursive: true });
    writeFileSync(path.join(web, 'package.json'), '{}');
    writeFileSync(cli, '');
    assert.equal(
      existsSync(path.join(root, 'node_modules/next/dist/bin/next')),
      false
    );
    assert.equal(
      resolveNextCli(path.join(web, 'package.json')),
      realpathSync(cli)
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('default Next CLI lookup uses the installed Web workspace dependency', () => {
  assert.equal(existsSync(resolveNextCli()), true);
});

test('fixture transforms do not resolve unrelated root project presets', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'employee-fixture-transform-'));
  const fixtures = path.join(root, 'apps/web/e2e/fixtures');
  const source = fileURLToPath(new URL('.', import.meta.url));
  try {
    mkdirSync(fixtures, { recursive: true });
    mkdirSync(path.join(root, 'packages/unrelated'), { recursive: true });
    writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        files: [],
        references: [{ path: './packages/unrelated' }],
      })
    );
    writeFileSync(
      path.join(root, 'packages/unrelated/tsconfig.json'),
      JSON.stringify({
        extends: '@tuturuuu/typescript-config/react-library.json',
      })
    );
    // Web excludes e2e; an unmatched fixture otherwise reaches root references.
    writeFileSync(
      path.join(root, 'apps/web/tsconfig.json'),
      JSON.stringify({ include: ['src'] })
    );
    const config = path.join(source, 'tsconfig.json');
    if (existsSync(config)) {
      copyFileSync(config, path.join(fixtures, 'tsconfig.json'));
    }
    for (const name of [
      'employee-web-session-support.test.ts',
      'employee-web-session-support.ts',
    ]) {
      const code = readFileSync(path.join(source, name), 'utf8');
      const filename = path.join(fixtures, name);
      writeFileSync(filename, code);
      const transformed = await transformWithOxc(code, filename);
      assert.ok(transformed.code.length > 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('original failure survives both cleanup failures and both cleanup steps run', async () => {
  const calls: string[] = [];
  const result = await sessionLifecycle(
    async () => {
      assert.fail('private original assertion');
    },
    () => 'build',
    async () => {
      calls.push('server');
      throw new Error('private server failure');
    },
    async () => {
      calls.push('proxy');
      throw new Error('private proxy failure');
    }
  );
  assert.deepEqual(calls, ['server', 'proxy']);
  assert.deepEqual(result, {
    failure: {
      phase: 'build',
      kind: 'assertion',
      exitCode: null,
      signal: null,
      timedOut: false,
    },
    cleanup: {
      server: 'failed',
      proxy: 'failed',
      serverError: 'unknown',
      proxyError: 'unknown',
    },
  });
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('cleanup-only failure retains cleanup phase and cannot qualify', async () => {
  const result = await sessionLifecycle(
    async () => {},
    () => 'cases',
    async () => {},
    async () => {
      throw new Error('private proxy failure');
    }
  );
  assert.equal(result.failure?.phase, 'cleanup');
  assert.deepEqual(result.cleanup, {
    server: 'stopped',
    proxy: 'failed',
    serverError: null,
    proxyError: 'unknown',
  });
});

test('successful lifecycle drains cleanup and reports no failure', async () => {
  const child = command(
    'node',
    ['-e', 'setInterval(() => {}, 1000)'],
    process.env
  );
  await once(child, 'spawn');
  const result = await sessionLifecycle(
    async () => {},
    () => 'start',
    () => stop(child),
    async () => {}
  );
  assert.deepEqual(result, {
    failure: null,
    cleanup: {
      server: 'stopped',
      proxy: 'closed',
      serverError: null,
      proxyError: null,
    },
  });
  assert.ok(child.signalCode !== null || child.exitCode !== null);
});

test('actual failing process retains fixed build exit diagnostics without output', async () => {
  const result = await sessionLifecycle(
    () =>
      completeBuild(
        'node',
        ['-e', "console.error('private-output');process.exit(7)"],
        process.env
      ),
    () => 'build',
    async () => {},
    async () => {}
  );
  assert.deepEqual(result.failure, {
    phase: 'build',
    buildDiagnostic: { diagnostics: [], truncated: false },
    kind: 'process',
    exitCode: 7,
    signal: null,
    timedOut: false,
  });
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('actual build-process deadline stops the owned child and retains timeout', async () => {
  const result = await sessionLifecycle(
    () =>
      completeBuild(
        'node',
        ['-e', 'setInterval(() => {}, 1000)'],
        process.env,
        50
      ),
    () => 'build',
    async () => {},
    async () => {}
  );
  assert.equal(result.failure?.kind, 'process');
  assert.equal(result.failure?.timedOut, true);
  assert.ok(
    result.failure?.signal !== null || result.failure?.exitCode !== null
  );
  assert.deepEqual(sessionFailure(new Error('private'), 'configuration'), {
    phase: 'configuration',
    kind: 'unknown',
    exitCode: null,
    signal: null,
    timedOut: false,
  });
});

test('real build-boundary pipes retain only compiler classification and actual first exit', async () => {
  const launch = () =>
    completeBuild(
      'node',
      [
        '-e',
        String.raw`process.stdout.write('./src/lib/public.ts:3:1\n');process.stderr.write('Module not found: Cannot find module private-token ERR_MODULE_NOT_FOUND\n');process.exit(9)`,
      ],
      process.env
    );
  const result = await sessionLifecycle(
    launch,
    () => 'build',
    async () => {
      throw new Error('private-cleanup');
    },
    async () => {}
  );
  assert.equal(result.failure?.exitCode, 9);
  assert.deepEqual(result.failure?.buildDiagnostic, {
    diagnostics: [
      {
        category: 'module-resolution',
        code: 'ERR_MODULE_NOT_FOUND',
        path: null,
      },
    ],
    truncated: false,
  });
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('proxy close on the actual Bun runtime is a separate finite control', async () => {
  const result = await runOwnedSessionProcess(
    'bun',
    [
      '-e',
      `
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {createConnection} from 'node:net';
import {faultProxy} from './apps/web/e2e/fixtures/employee-web-session-support.ts';
let phase='open';
try {
  const proxy=await faultProxy({url:'http://127.0.0.1:1',key:'unused',anonKey:'unused',projectId:'unused',basePort:12000,sourceSha:'a'.repeat(40)});
  phase='close';
  await proxy.close();
  phase='port-refusal';
  await new Promise((resolve,reject)=>{
    const socket=createConnection({host:'127.0.0.1',port:Number(new URL(proxy.url).port)});
    socket.once('connect',()=>{socket.destroy();reject(new Error('Port still open'));});
    socket.once('error',error=>error.code==='ECONNREFUSED'?resolve():reject(error));
  });
  phase='repeated-close';
  await assert.rejects(()=>proxy.close(),{code:'ERR_SERVER_NOT_RUNNING'});
  console.log(JSON.stringify({phase:'complete',error:'none'}));
} catch(error) {
  console.log(JSON.stringify({phase,error:error?.code==='ERR_SERVER_NOT_RUNNING'?'not-running':error instanceof TypeError?'type-error':error?.code==='ERR_ASSERTION'?'assertion':'unknown'}));
  process.exitCode=1;
}`,
    ],
    { cwd: process.cwd(), timeoutMs: 5000, env: process.env }
  );
  const Control = z.strictObject({
    phase: z.enum([
      'open',
      'close',
      'port-refusal',
      'repeated-close',
      'complete',
    ]),
    error: z.enum([
      'none',
      'not-running',
      'type-error',
      'assertion',
      'unknown',
    ]),
  });
  const output = z.string().parse(result.stdout);
  const overflow = Buffer.byteLength(output) > 1024;
  const failed = result.status !== 0 || !result.processGroupStopped;
  let diagnostic: z.infer<typeof Control> | null = null;
  try {
    diagnostic = Control.parse(JSON.parse(output));
  } catch {
    /* Fixed failure below. */
  }
  assert.ok(!overflow && diagnostic, 'Proxy control diagnostic invalid');
  assert.equal(failed, false, JSON.stringify(diagnostic));
  assert.deepEqual(diagnostic, { phase: 'complete', error: 'none' });
});

test('session build selects canonical dependency graph before the uncached real Web compiler', () => {
  const root = fileURLToPath(new URL('../../../..', import.meta.url));
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8')
  );
  const turbo = JSON.parse(readFileSync(path.join(root, 'turbo.json'), 'utf8'));
  const web = JSON.parse(
    readFileSync(path.join(root, 'apps/web/package.json'), 'utf8')
  );
  const commands = webSessionBuildCommands();
  assert.equal(
    manifest.scripts['build:web'],
    'bun turbo:local run build -F @tuturuuu/web'
  );
  assert.deepEqual(turbo.tasks.build.dependsOn, ['^build']);
  assert.deepEqual(commands, [
    [
      'turbo:local',
      'run',
      'build',
      '--filter=@tuturuuu/web^...',
      '--concurrency=1',
    ],
    ['run', '--cwd', 'apps/web', 'build'],
  ]);
  assert.ok(web.scripts.build.includes('next build --turbopack'));
  assert.equal(
    commands.flat().some((arg) => /env-mode|dry|setup|alias/.test(arg)),
    false
  );
});

test('real workspace export manifest requires emitted Node target even when source exists', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'employee-workspace-export-'));
  const sourceRoot = fileURLToPath(new URL('../../../..', import.meta.url));
  try {
    const fixturePackage = path.join(root, 'node_modules/@tuturuuu/supabase');
    const actualPackage = path.join(sourceRoot, 'packages/supabase');
    mkdirSync(path.join(fixturePackage, 'src/next'), { recursive: true });
    copyFileSync(
      path.join(actualPackage, 'package.json'),
      path.join(fixturePackage, 'package.json')
    );
    copyFileSync(
      path.join(actualPackage, 'src/next/server.ts'),
      path.join(fixturePackage, 'src/next/server.ts')
    );
    const manifest = JSON.parse(
      readFileSync(path.join(fixturePackage, 'package.json'), 'utf8')
    );
    assert.equal(
      manifest.exports['./next/server'].default,
      './dist/next/server.js'
    );
    assert.equal(manifest.exports['./next/server'].bun, './src/next/server.ts');
    assert.equal(
      existsSync(path.join(fixturePackage, 'src/next/server.ts')),
      true
    );
    assert.equal(
      existsSync(path.join(fixturePackage, 'dist/next/server.js')),
      false
    );
    assert.throws(
      () =>
        createRequire(path.join(root, 'package.json')).resolve(
          '@tuturuuu/supabase/next/server'
        ),
      { code: 'MODULE_NOT_FOUND' }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('actual Next CLI startup errors use bounded capture without loading an app', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'employee-start-capture-'));
  try {
    for (const [args, category] of [
      [
        [
          'start',
          path.join(directory, 'absent'),
          '--hostname',
          '127.0.0.1',
          '--port',
          '49152',
        ],
        'missing-project-directory',
      ],
      [['start', '--employee-nonexistent-option'], 'unsupported-cli-option'],
    ] as const) {
      const child = command(process.execPath, [resolveNextCli(), ...args], {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 4000);
      try {
        await once(child, 'close');
        assert.equal(child.exitCode, 1);
        assert.equal(child.signalCode, null);
        assert.deepEqual(await child.startupOutput(), {
          categories: [category],
          truncated: false,
        });
      } finally {
        clearTimeout(timer);
        await stop(child);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('startup pipes drain simultaneous floods and strip synthetic secrets', async () => {
  const child = command(
    process.execPath,
    [
      '-e',
      `
    process.stderr.write('EADDR');
    setTimeout(() => {
      process.stderr.write('INUSE secret=https://private.invalid/token\\n');
      process.stdout.write('SyntaxError: private-body\\n');
      process.stdout.write(Buffer.alloc(2 * 1024 * 1024, 120));
      process.stderr.write(Buffer.alloc(2 * 1024 * 1024, 120));
    }, 5);
  `,
    ],
    { PATH: process.env.PATH }
  );
  const timer = setTimeout(() => child.kill('SIGKILL'), 4000);
  try {
    await once(child, 'close');
    assert.equal(child.exitCode, 0);
    const output = await child.startupOutput();
    assert.deepEqual(output, {
      categories: ['address-in-use', 'runtime-syntax'],
      truncated: true,
    });
    assert.ok(!JSON.stringify(output).includes('private'));
    assert.ok(Buffer.byteLength(JSON.stringify(output)) < 512);
  } finally {
    clearTimeout(timer);
    await stop(child);
  }
});

test('inherited startup pipes cannot block server cleanup or the outer group owner', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'employee-start-pipes-'));
  const bun = execFileSync(
    'bun',
    ['--no-install', '-e', 'process.stdout.write(process.execPath)'],
    { encoding: 'utf8', timeout: 5000 }
  ).trim();
  try {
    for (const mode of ['leader-exit', 'leader-stop']) {
      const marker = path.join(directory, mode);
      const descendant = `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000)`;
      const leader = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore',1,2]});const timer=setInterval(()=>{if(require('node:fs').existsSync(${JSON.stringify(marker)})){clearInterval(timer);console.log('EADDRINUSE');${mode === 'leader-exit' ? 'process.exit(7)' : 'setInterval(()=>{},1000)'}}},5)`;
      const support = fileURLToPath(
        new URL('./employee-web-session-support.ts', import.meta.url)
      );
      const worker = `
        const {command,stop,sessionLifecycle}=await import(${JSON.stringify(support)});
        const {once}=await import('node:events');
        const child=command(${JSON.stringify(process.execPath)},['-e',${JSON.stringify(leader)}],{PATH:process.env.PATH});
        await once(child.stdout,'data');
        if(${JSON.stringify(mode)}==='leader-exit' && child.exitCode===null) await once(child,'exit');
        const start=performance.now();let proxyClosed=false;
        const result=await sessionLifecycle(async()=>{},()=> 'start',()=>stop(child),async()=>{proxyClosed=true});
        const output=await child.startupOutput();
        console.log(JSON.stringify({result,output,proxyClosed,bounded:performance.now()-start<2000,pipesClosed:child.stdout.destroyed&&child.stderr.destroyed}));
      `;
      const result = await runOwnedSessionProcess(
        bun,
        ['--no-install', '-e', worker],
        {
          cwd: process.cwd(),
          timeoutMs: 7000,
        }
      );
      assert.equal(result.status, 0);
      assert.equal(result.processGroupStopped, true);
      const receipt = JSON.parse(result.stdout);
      assert.equal(receipt.result.failure, null);
      assert.deepEqual(receipt.result.cleanup, {
        server: 'stopped',
        proxy: 'closed',
        serverError: null,
        proxyError: null,
      });
      assert.deepEqual(receipt.output, {
        categories: ['address-in-use'],
        truncated: true,
      });
      assert.equal(receipt.proxyClosed, true);
      assert.equal(receipt.bounded, true);
      assert.equal(receipt.pipesClosed, true);
      const pid = Number(readFileSync(marker, 'utf8'));
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
