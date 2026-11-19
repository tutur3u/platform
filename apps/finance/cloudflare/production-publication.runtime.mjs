import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { app, financeRuntime, profile } from './native-runtime-fixture.mjs';

const productionOnly = { skip: profile.name !== 'production' };

test(
  'production publication preserves anonymous auth and static responses',
  productionOnly,
  async (t) => {
    const origin = 'https://finance.tuturuuu.com';
    const runtime = await financeRuntime(t, { financeOrigin: origin });
    const probe = async (path) => {
      const response = await runtime.fetch(new URL(path, origin).href, {
        redirect: 'manual',
      });
      console.log(
        JSON.stringify({
          path,
          status: response.status,
          location: response.headers.get('location'),
          contentType: response.headers.get('content-type'),
          cacheControl: response.headers.get('cache-control'),
          runtime: response.headers.get('x-tuturuuu-runtime'),
          cookies: response.headers.getSetCookie().length,
        })
      );
      assert.equal(response.headers.get('x-tuturuuu-runtime'), 'native');
      return response;
    };
    for (const path of ['/', '/en/00000000-0000-4000-8000-000000000001']) {
      const response = await probe(path);
      assert.equal(response.status, 307);
      const login = new URL(response.headers.get('location'));
      assert.equal(login.origin, 'https://tuturuuu.com');
      assert.equal(login.pathname, '/login');
      const returnUrl = new URL(login.searchParams.get('returnUrl'));
      assert.equal(returnUrl.origin, origin);
      assert.equal(returnUrl.pathname, '/verify-token');
      assert.equal(returnUrl.searchParams.get('nextUrl'), path);
    }
    const assets = await readdir(join(app, 'dist/client/assets'));
    const asset = assets.find((name) => name.endsWith('.js'));
    assert.ok(asset);
    const response = await probe(`/assets/${asset}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await readFile(join(app, 'dist/client/assets', asset))
    );
    const missing = await probe('/assets/finance-publication-missing.js');
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('location'), null);
    assert.deepEqual(missing.headers.getSetCookie(), []);
    assert.deepEqual(runtime.unexpected, []);
    assert.deepEqual(runtime.central, []);
  }
);

test(
  'production server artifact stays within the map budget and excludes development defaults',
  productionOnly,
  async () => {
    const root = join(app, 'dist/server');
    const files = await readdir(root, { recursive: true, withFileTypes: true });
    let sourcemapBytes = 0;
    for (const file of files) {
      if (!file.isFile()) continue;
      const path = join(file.parentPath, file.name);
      const bytes = await readFile(path);
      if (file.name.endsWith('.map')) sourcemapBytes += bytes.length;
      if (!/\.(?:m?js|cjs|json|map)$/.test(file.name)) continue;
      const text = bytes.toString('utf8');
      assert.ok(
        !text.includes('tuturuuu-local-development-app-coordination-secret'),
        path
      );
      if (file.name.endsWith('.map')) continue;
      for (const forbidden of [
        'process.env.NODE_ENV',
        'finance.tutur3u.com',
        'fxefojytwimjiqxseqag',
      ]) {
        assert.ok(!text.includes(forbidden), `${path}: ${forbidden}`);
      }
    }
    assert.ok(
      sourcemapBytes < 60 * 1024 ** 2,
      `Server sourcemaps exceed 60 MiB: ${sourcemapBytes}`
    );
    console.log(JSON.stringify({ sourcemapBytes }));
  }
);
