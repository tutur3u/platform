import assert from 'node:assert/strict';
import test from 'node:test';
import { startFixtureWorker } from './runtime-fixture.mjs';

const mounted = process.env.VITE_AI_NATIVE_PROFILE === 'production';

// `worker.fetch` keeps the https apex URL, which is what the mounted session
// admits; the raw-socket probes of the other fixtures reach the Worker as http.
test(
  mounted
    ? 'the emitted AI Worker signs visitors in through tuturuuu.com/ai'
    : 'the staging-profile AI Worker refuses tuturuuu.com',
  { timeout: 120000 },
  async (t) => {
    const worker = await startFixtureWorker(t, { secure: true });
    const call = (path, init) =>
      worker.fetch(`https://tuturuuu.com${path}`, {
        redirect: 'manual',
        ...init,
      });

    if (!mounted) {
      for (const path of ['/ai', '/ai/verify-token', '/ai/v1/models']) {
        const response = await call(path);
        assert.equal(response.status, 404, path);
        assert.equal(await response.text(), 'Not Found', path);
      }
      return;
    }

    for (const [path, destination] of [
      ['/ai', '/products/ai'],
      ['/ai/vi', '/vi/products/ai'],
    ]) {
      const response = await call(`${path}?utm=a&utm=b`);
      assert.equal(response.status, 307, path);
      assert.equal(
        response.headers.get('location'),
        `https://tuturuuu.com${destination}?utm=a&utm=b`
      );
      assert.equal(response.headers.get('x-tuturuuu-runtime'), 'native');
    }

    for (const path of ['/ai/personal/playground', '/ai/verify-token']) {
      const response = await call(path);
      assert.equal(response.status, 307, path);
      const login = new URL(response.headers.get('location'));
      assert.equal(
        login.origin + login.pathname,
        'https://tuturuuu.com/login',
        path
      );
      assert.equal(
        new URL(login.searchParams.get('returnUrl')).pathname,
        '/ai/verify-token',
        path
      );
      assert.deepEqual(response.headers.getSetCookie(), [], path);
    }

    // The mount uses Web's session: it never mints an app session.
    const mint = await call('/ai/api/auth/verify-app-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(mint.status, 409);
    assert.equal((await mint.json()).code, 'APP_SESSION_MOUNTED');

    assert.equal((await call('/ai/v1/models')).status, 401);
    const info = await call('/ai/api/build-info');
    assert.equal(info.status, 200);
    assert.equal((await info.json()).appName, 'ai');
  }
);
