import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createFixtureServer } from './web-fixture-server.mjs';

test('fixture sign-in and session require exact credentials', async (t) => {
  const email = 'fixture@example.invalid';
  const password = 'test-password';
  const server = createFixtureServer({
    E2E_USER_EMAIL: email,
    E2E_SECRET_PASSWORD: password,
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;

  const signIn = (candidate) =>
    fetch(`${origin}/api/e2e-fixture/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: candidate }),
    });

  for (const [label, candidate] of [
    ['different-length password', 'short'],
    ['equal-length wrong password', 'test-passw0rd'],
    ['non-string password', 1234],
    ['empty password', ''],
  ]) {
    await t.test(label, async () => {
      const response = await signIn(candidate);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('set-cookie'), null);
      await response.body.cancel();
    });
  }

  const response = await signIn(password);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const [cookie] = response.headers.getSetCookie();
  assert.match(cookie, /^ttr_e2e_fixture_session=[\da-f-]{36};/u);
  const [sessionCookie] = cookie.split(';');
  const openPersonal = (value) =>
    fetch(`${origin}/en/personal`, {
      redirect: 'manual',
      headers: { cookie: value },
    });

  const personal = await openPersonal(sessionCookie);
  assert.equal(personal.status, 200);
  assert.match(await personal.text(), /<h1>Personal Workspace<\/h1>/u);

  const lastCharacter = sessionCookie.endsWith('0') ? '1' : '0';
  const wrongSession = await openPersonal(
    sessionCookie.slice(0, -1) + lastCharacter
  );
  assert.equal(wrongSession.status, 302);
  assert.equal(wrongSession.headers.get('location'), '/en/login');
});
