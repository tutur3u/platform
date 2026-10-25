// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: disposable local Worker fixtures.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));

test('Vite Worker preview preserves health, session and access boundaries', {
  timeout: 60_000,
}, async () => {
  for (const directory of new Set([root, process.cwd()])) {
    assert.deepEqual(
      readdirSync(directory).filter(
        (name) =>
          /^\.(?:env|dev\.vars)(?:\..*)?$/.test(name) &&
          !name.endsWith('.example')
      ),
      [],
      'preview qualification refuses local credential files'
    );
  }
  const persistence = mkdtempSync(join(tmpdir(), 'colab-preview-'));
  const fixtures = {
    COLAB_SESSION_SECRET: randomUUID() + randomUUID(),
    CF_VITE_TEST_PERSIST_PATH: persistence,
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true',
    CLOUDFLARE_VITE_FORCE_LOCAL: 'true',
  };
  const previous = new Map(
    Object.keys(fixtures).map((name) => [name, process.env[name]])
  );
  let server;
  try {
    Object.assign(process.env, fixtures);
    server = await createServer({
      root,
      configFile: join(root, 'vite.worker.config.ts'),
      logLevel: 'warn',
      clearScreen: false,
      server: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    const request = (path, init) =>
      fetch(new URL(path, origin), {
        ...init,
        signal: AbortSignal.timeout(10_000),
      });
    const page = await request('/?auth=retry');
    assert.equal(page.status, 200);
    assert.match(
      page.headers.get('content-security-policy'),
      /script-src 'self'/
    );
    const html = await page.text();
    assert.match(html, /src\/client\/main\.tsx/);
    assert.doesNotMatch(
      html,
      /@react-refresh|__vite_plugin_react_preamble_installed__/
    );
    const client = await request('/src/client/main.tsx');
    assert.equal(client.status, 200);
    assert.match(await client.text(), /packages\/internal-api\/src\//);
    const styles = await request('/src/client/app.css?direct');
    assert.equal(styles.status, 200);
    assert.match(await styles.text(), /\.flex\s*\{\s*display:\s*flex/);
    const health = await request('/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      app: 'colab',
      status: 'ok',
      sandbox: true,
    });
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    const session = await request('/api/session');
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), {
      identity: null,
      canHost: false,
    });
    const workshops = await request('/api/workshops');
    assert.equal(workshops.status, 401);
    assert.deepEqual(await workshops.json(), { error: 'sign_in_required' });
    const logout = await request('/api/logout', {
      method: 'POST',
      headers: { Origin: 'https://foreign.example.invalid' },
    });
    assert.equal(logout.status, 403);
    assert.deepEqual(await logout.json(), { error: 'invalid_origin' });
  } finally {
    try {
      await server?.close();
    } finally {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      rmSync(persistence, { recursive: true, force: true });
    }
  }
});
