#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertHostedOwner,
  profilePreflight,
} from './mail-profile-runtime-preflight.mjs';

export { assertHostedOwner, profilePreflight };

export const PROFILE_TITLE =
  'saves canonical identity and a rich About profile with reload persistence';
export const TRANSPORT_TITLE =
  'isolates session transport through native browser preflights and redirects';
const activeCommands = new Set();
let interrupted = false;
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

export function playwrightConfig(directory, reports, playwrightPath) {
  return `const {defineConfig}=require(${JSON.stringify(playwrightPath)});
module.exports=defineConfig({testDir:${JSON.stringify(directory)},
 testMatch:['lettin-wiki.noauth.spec.ts','lettin-session-transport.noauth.spec.ts'],
 grep:/${PROFILE_TITLE}|${TRANSPORT_TITLE}/,
 fullyParallel:false,workers:1,retries:0,forbidOnly:true,timeout:60000,
 expect:{timeout:15000},outputDir:${JSON.stringify(path.join(reports, 'browser'))},
 reporter:[['json',{outputFile:${JSON.stringify(path.join(reports, 'results.json'))}}]],
 use:{browserName:'chromium',baseURL:'http://127.0.0.1:7803',
 ignoreHTTPSErrors:false,launchOptions:{chromiumSandbox:true},
 trace:'off',screenshot:'off',navigationTimeout:60000}});\n`;
}

// The unchanged profile suite has its own synthetic account/D1/media cleanup.
// Exactly two collected tests must actually pass; skipped and empty are failures.
export function assertBrowserResults(report) {
  const tests = [];
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? [])
        tests.push({ title: spec.title, test });
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  assert.deepEqual(
    tests.map((entry) => entry.title).sort(),
    [PROFILE_TITLE, TRANSPORT_TITLE].sort()
  );
  assert.equal(report.errors?.length ?? 0, 0);
  for (const { test } of tests) {
    assert.equal(test.expectedStatus, 'passed');
    assert.equal(test.results.length, 1);
    assert.equal(test.results[0].status, 'passed');
  }
}

export async function stopOwnedChildren(children, stop) {
  const failures = [];
  for (const child of [...children].reverse()) {
    try {
      await stop(child);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, 'Owned process stop failed');
}

export function ownedCleanupOnce(cleanup) {
  let result;
  return {
    get attempted() {
      return result !== undefined;
    },
    run() {
      result ??= Promise.resolve().then(cleanup);
      return result;
    },
  };
}

async function available(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

async function command(
  commandName,
  args,
  { cwd = root, env = process.env, timeout = 600000, capture = false } = {}
) {
  const cleanup =
    args.includes('stop') ||
    (commandName === 'certutil' && args.includes('-D'));
  assert.ok(!interrupted || cleanup, 'Owned stage interrupted');
  const child = spawn(commandName, args, {
    cwd,
    env,
    detached: true,
    stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'inherit',
  });
  activeCommands.add(child);
  let output = '';
  if (capture)
    child.stdout.on('data', (data) => {
      output += data;
      if (output.length > 8_000_000) child.kill('SIGTERM');
    });
  let timedOut = false;
  let signalError;
  const signalChild = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') signalError = error;
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    signalChild('SIGTERM');
  }, timeout);
  const escalation = setTimeout(() => {
    if (timedOut) signalChild('SIGKILL');
  }, timeout + 10000);
  try {
    const [code, signal] = await once(child, 'exit');
    assert.ok(!interrupted || cleanup, 'Owned stage interrupted');
    assert.equal(signalError, undefined, 'Owned signal failed');
    assert.equal(timedOut, false, 'Owned command exceeded its deadline');
    assert.equal(code, 0, `Owned command failed (${signal ?? code})`);
    return output;
  } finally {
    activeCommands.delete(child);
    clearTimeout(timer);
    clearTimeout(escalation);
  }
}

async function startApp(app, port, env, children, reports) {
  const log = await fs.open(
    path.join(reports, `${app}-private.log`),
    'wx',
    0o600
  );
  const child = spawn(
    'bun',
    [
      'x',
      '--no-install',
      'next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '-p',
      String(port),
    ],
    {
      cwd: path.join(root, 'apps', app),
      env,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
    }
  );
  await log.close();
  child.on('error', () => {});
  children.push(child);
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    assert.equal(child.exitCode, null, 'Owned app exited before readiness');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/login`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(3000),
      });
      if (response.status >= 200 && response.status < 400) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Owned app readiness deadline exceeded');
}

async function stopChild(child) {
  const exited = child.exitCode !== null || child.signalCode !== null;
  if (!exited) {
    process.kill(-child.pid, 'SIGTERM');
    const stopped = await Promise.race([
      once(child, 'exit').then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
    ]);
    if (!stopped) {
      process.kill(-child.pid, 'SIGKILL');
      await once(child, 'exit');
    }
  }
  // Also reap any descendant surviving an already exited owned leader.
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  try {
    process.kill(-child.pid, 0);
    throw new Error('Owned process group remains');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function certificates(directory) {
  const ca = path.join(directory, 'ca.pem');
  const key = path.join(directory, 'storage.key');
  const cert = path.join(directory, 'storage.pem');
  await command(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      path.join(directory, 'ca.key'),
      '-out',
      ca,
      '-days',
      '1',
      '-subj',
      '/CN=Tuturuuu owned ephemeral profile CA',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
    ],
    { capture: true }
  );
  await command(
    'openssl',
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      path.join(directory, 'storage.csr'),
      '-subj',
      '/CN=localhost',
    ],
    { capture: true }
  );
  const extensions = path.join(directory, 'extensions');
  await fs.writeFile(
    extensions,
    'subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n'
  );
  await command(
    'openssl',
    [
      'x509',
      '-req',
      '-in',
      path.join(directory, 'storage.csr'),
      '-CA',
      ca,
      '-CAkey',
      path.join(directory, 'ca.key'),
      '-CAcreateserial',
      '-out',
      cert,
      '-days',
      '1',
      '-extfile',
      extensions,
    ],
    { capture: true }
  );
  const nss = path.join(os.homedir(), '.pki/nssdb');
  await fs.mkdir(nss, { recursive: true });
  // The disposable runner must not contain a preexisting user trust database.
  assert.deepEqual(await fs.readdir(nss), []);
  await command('certutil', ['-N', '-d', `sql:${nss}`, '--empty-password'], {
    capture: true,
  });
  await command(
    'certutil',
    [
      '-A',
      '-d',
      `sql:${nss}`,
      '-n',
      'tuturuuu-owned-profile',
      '-t',
      'C,,',
      '-i',
      ca,
    ],
    { capture: true }
  );
  return { ca, key, cert, nss };
}

async function storageProxy(tls) {
  const server = https.createServer(
    { key: await fs.readFile(tls.key), cert: await fs.readFile(tls.cert) },
    (request, response) => {
      if (
        !request.url?.startsWith('/storage/v1/') ||
        request.headers.host !== '127.0.0.1:8443'
      ) {
        response.writeHead(403);
        response.end();
        return;
      }
      const upstream = http.request(
        {
          hostname: '127.0.0.1',
          port: 8001,
          path: request.url,
          method: request.method,
          headers: { ...request.headers, host: '127.0.0.1:8001' },
        },
        (result) => {
          response.writeHead(result.statusCode ?? 502, result.headers);
          result.pipe(response);
        }
      );
      upstream.setTimeout(30000, () => upstream.destroy());
      upstream.on('error', () => {
        response.writeHead(502);
        response.end();
      });
      request.pipe(upstream);
    }
  );
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(8443, '127.0.0.1', resolve);
  });
  return server;
}

export async function main() {
  const onSignal = () => {
    interrupted = true;
    for (const child of activeCommands) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
      const escalation = setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }, 10000);
      escalation.unref();
    }
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
  assert.ok(process.env.RUNNER_TEMP, 'Missing hosted private scratch root');
  assert.ok(
    path.isAbsolute(process.env.RUNNER_TEMP),
    'Scratch root must be absolute'
  );
  assert.match(process.env.GITHUB_RUN_ID ?? '', /^\d+$/u);
  const reports = path.join(
    process.env.RUNNER_TEMP,
    `mail-profile-${process.env.GITHUB_RUN_ID}`
  );
  await fs.mkdir(reports, { recursive: false, mode: 0o700 });
  const { sha, indexHash } = await profilePreflight({
    env: process.env,
    expectedHead: process.argv[2],
    run: (tool, args) => command(tool, args, { capture: true }),
    checkPort: available,
    record: (record) =>
      fs.writeFile(
        path.join(reports, 'terminal.json'),
        `${JSON.stringify(record, null, 2)}\n`,
        { flag: 'wx', mode: 0o600 }
      ),
  });
  const disposable = await fs.mkdtemp(
    path.join(os.tmpdir(), 'tuturuuu-profile-tls-')
  );
  const children = [];
  const cleanupFailures = [];
  const appCleanup = ownedCleanupOnce(() =>
    stopOwnedChildren(children, stopChild)
  );
  let proxy;
  let tls;
  let primary = 1;
  let metadata;
  const isolated = await import(
    '../../apps/database/scripts/run-supabase-isolated.js'
  );
  const { ensureSupabaseBinary } = await import(
    '../../apps/database/scripts/run-supabase.js'
  );
  try {
    const identity = isolated.deriveIsolatedIdentity({
      headSha: sha,
      repositoryPath: root,
    });
    const trackedFiles = isolated.listTrackedSupabaseFiles(root);
    metadata = await isolated.stageDisposableProject({
      repositoryRoot: root,
      headSha: sha,
      projectId: identity.projectId,
      basePort: 8000,
      trackedFiles,
    });
    for (const source of trackedFiles.filter(
      (name) => !name.endsWith('/config.toml')
    )) {
      assert.deepEqual(
        await fs.readFile(path.join(root, source)),
        await fs.readFile(
          path.join(
            metadata.disposableRoot,
            source.slice('apps/database/'.length)
          )
        )
      );
    }
    const binary = await ensureSupabaseBinary(path.join(root, 'apps/database'));
    const runner = async (tool, args, cwd) => {
      if (!args.includes('test')) {
        await command(tool, args, { cwd, timeout: 900000, capture: true });
        return { code: 0 };
      }
      const status = JSON.parse(
        await command(tool, ['--workdir', cwd, 'status', '-o', 'json'], {
          cwd,
          capture: true,
        })
      );
      assert.equal(status.API_URL, 'http://127.0.0.1:8001');
      assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY);
      tls = await certificates(disposable);
      proxy = await storageProxy(tls);
      const env = {
        ...process.env,
        NODE_ENV: 'development',
        NODE_OPTIONS: '--max-old-space-size=4096 --experimental-require-module',
        NODE_EXTRA_CA_CERTS: tls.ca,
        NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
        SUPABASE_SERVER_URL: status.API_URL,
        SUPABASE_URL: status.API_URL,
        SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
        BASE_URL: 'http://127.0.0.1:7803',
        WEB_APP_URL: 'http://127.0.0.1:7803',
        NEXT_PUBLIC_WEB_APP_URL: 'http://127.0.0.1:7803',
        INTERNAL_WEB_API_ORIGIN: 'http://127.0.0.1:7803',
        TUTURUUU_APP_COORDINATION_SECRET: randomBytes(32).toString('hex'),
        SUPABASE_PUBLIC_STORAGE_ORIGIN: 'https://127.0.0.1:8443',
        LETTIN_BASE_URL: 'http://127.0.0.1:7833',
        LETTIN_APP_URL: 'http://127.0.0.1:7833',
        NEXT_PUBLIC_LETTIN_APP_URL: 'http://127.0.0.1:7833',
      };
      await command(
        'bun',
        [
          'turbo:local',
          'run',
          'build',
          '--concurrency=2',
          '--filter=@tuturuuu/web^...',
          '--filter=@tuturuuu/lettin^...',
        ],
        { env, timeout: 900000 }
      );
      await startApp(
        'web',
        7803,
        { ...env, NEXT_PUBLIC_APP_URL: env.BASE_URL },
        children,
        reports
      );
      await startApp(
        'lettin',
        7833,
        { ...env, NEXT_PUBLIC_APP_URL: env.LETTIN_BASE_URL },
        children,
        reports
      );
      const config = path.join(reports, 'playwright.config.cjs');
      await fs.writeFile(
        config,
        playwrightConfig(
          path.join(root, 'apps/web/e2e'),
          reports,
          path.join(root, 'apps/web/node_modules/@playwright/test')
        )
      );
      let browserError;
      try {
        await command(
          'bun',
          ['x', '--no-install', 'playwright', 'test', '--config', config],
          { cwd: path.join(root, 'apps/web'), env, timeout: 600000 }
        );
        assertBrowserResults(
          JSON.parse(
            await fs.readFile(path.join(reports, 'results.json'), 'utf8')
          )
        );
      } catch (error) {
        browserError = error;
      } finally {
        try {
          await appCleanup.run();
        } catch {
          cleanupFailures.push('app-processes');
        }
        children.length = 0;
        const closingProxy = proxy;
        proxy = null;
        try {
          closingProxy.closeAllConnections();
          await new Promise((resolve, reject) =>
            closingProxy.close((error) => (error ? reject(error) : resolve()))
          );
        } catch {
          cleanupFailures.push('storage-proxy');
        }
      }
      if (browserError) throw browserError;
      assert.equal(
        cleanupFailures.length,
        0,
        'Owned browser fixture cleanup failed'
      );
      return { code: 0 };
    };
    const lifecycleCode = await isolated.runIsolatedLifecycle({
      binaryPath: binary,
      metadata,
      runner,
    });
    assert.equal(
      lifecycleCode,
      0,
      'Full fixture or scoped Supabase stop failed'
    );
    assert.equal(
      (await command('docker', ['ps', '-aq'], { capture: true })).trim(),
      '',
      'Owned fixture containers remain'
    );
    assert.equal(
      (await command('git', ['diff', '--name-only'], { capture: true })).trim(),
      ''
    );
    assert.equal(
      createHash('sha256')
        .update(await command('git', ['ls-files', '-s'], { capture: true }))
        .digest('hex'),
      indexHash
    );
    primary = 0;
  } finally {
    if (!appCleanup.attempted) {
      try {
        await appCleanup.run();
      } catch {
        cleanupFailures.push('app-processes');
      }
    }
    if (proxy) {
      const closingProxy = proxy;
      proxy = null;
      closingProxy.closeAllConnections();
      try {
        await new Promise((resolve, reject) =>
          closingProxy.close((error) => (error ? reject(error) : resolve()))
        );
      } catch {
        cleanupFailures.push('storage-proxy');
      }
    }
    if (tls) {
      try {
        await command(
          'certutil',
          ['-D', '-d', `sql:${tls.nss}`, '-n', 'tuturuuu-owned-profile'],
          { capture: true }
        );
      } catch {
        cleanupFailures.push('owned-CA');
      }
    }
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('SIGINT', onSignal);
    const record = {
      head: sha,
      indexHash,
      primary,
      cleanupFailures,
      appStopAttempted: appCleanup.attempted,
      outcome: primary === 0 && cleanupFailures.length === 0 ? 'PASS' : 'FAIL',
      profile: PROFILE_TITLE,
      transport: TRANSPORT_TITLE,
      scope: 'local application contract; not Cloudflare/provider/production',
      project: metadata?.projectId,
      fixtureRoot: metadata?.disposableRoot,
      results:
        primary === 0
          ? [PROFILE_TITLE, TRANSPORT_TITLE].map((title) => ({
              title,
              status: 'passed',
            }))
          : [],
      deploymentProof: false,
      productionProof: false,
    };
    await fs.writeFile(
      path.join(reports, 'terminal.json'),
      `${JSON.stringify(record, null, 2)}\n`
    );
    if (cleanupFailures.length === 0)
      await fs.rm(disposable, { recursive: true });
    assert.equal(cleanupFailures.length, 0, 'Owned cleanup failed');
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    console.error(
      'Mail profile fixture failed; inspect scoped terminal receipt'
    );
    process.exitCode = 1;
  });
}
