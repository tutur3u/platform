import assert from 'node:assert/strict';
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
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';
import { it as test } from 'vitest';
import {
  command,
  faultProxy,
  resolveNextCli,
  stop,
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
