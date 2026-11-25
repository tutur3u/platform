import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BINDINGS,
  OPTIONAL,
  REQUIRED,
  SOURCES,
  verifySecrets,
  WORKER,
  writeSecrets,
} from './whiteboards-worker-secrets.mjs';

const VALUES = {
  PRODUCTION_SUPABASE_URL: 'https://abcdefghij.supabase.co',
  PRODUCTION_SUPABASE_PUBLISHABLE_KEY:
    'sb_publishable_AAAAAAAAAAAAAAAAAAAAAAAA',
  PRODUCTION_SUPABASE_SECRET_KEY: 'sb_secret_BBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  TUTURUUU_APP_COORDINATION_SECRET:
    'Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4MDEyMzQ1Njc=',
  APP_COORDINATION_TOKEN_SECRET: 'c2lnbmVyc2lnbmVyc2lnbmVyc2lnbmVyc2lnbmVy',
};
const REQUIRED_ONLY = Object.fromEntries(
  REQUIRED.map((binding) => [SOURCES[binding], VALUES[SOURCES[binding]]])
);

function provider({ exists = true, stored = new Map() } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: init.method ?? 'GET', body: init.body });
    assert.ok(
      path.startsWith(
        `/client/v4/accounts/e8912e2867beecc673d171907bf09649/workers/scripts/${WORKER}`
      ),
      'only the Whiteboards Worker is addressed'
    );
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status });
    if (path.endsWith('/settings')) return json({}, exists ? 200 : 404);
    if (init.method === 'PUT') {
      const { name, type } = JSON.parse(init.body);
      stored.set(name, type);
      return json({ success: true, result: { name, type } });
    }
    return json({
      success: true,
      result: [...stored].map(([name, type]) => ({ name, type })),
    });
  };
  return { calls, fetchImpl };
}

test('writes the four bindings from their GitHub secrets and reads names back', async () => {
  const { calls, fetchImpl } = provider();
  const lines = await writeSecrets({ token: 't', env: VALUES, fetchImpl });

  assert.deepEqual(
    calls
      .filter((call) => call.method === 'PUT')
      .map((call) => JSON.parse(call.body).name),
    [...BINDINGS]
  );
  for (const call of calls.filter((entry) => entry.method === 'PUT'))
    assert.equal(
      JSON.parse(call.body).text,
      VALUES[SOURCES[JSON.parse(call.body).name]]
    );
  assert.deepEqual(
    lines,
    BINDINGS.map((name) => `${WORKER}: ${name} (secret_text)`)
  );
  assert.ok(
    lines.every(
      (line) => !Object.values(VALUES).some((value) => line.includes(value))
    ),
    'the readback never prints a value'
  );
});

test('refuses before any write when a value is missing, shaped wrong or a placeholder', async () => {
  for (const [name, value] of [
    ['PRODUCTION_SUPABASE_URL', 'https://evil.example.com'],
    ['PRODUCTION_SUPABASE_URL', undefined],
    [
      'PRODUCTION_SUPABASE_PUBLISHABLE_KEY',
      'sb_publishable_whiteboards_ci_placeholder',
    ],
    ['PRODUCTION_SUPABASE_SECRET_KEY', 'short'],
    ['TUTURUUU_APP_COORDINATION_SECRET', 'tuturuuu-local-development-secret'],
  ]) {
    const { calls, fetchImpl } = provider();
    await assert.rejects(
      writeSecrets({
        token: 't',
        env: { ...VALUES, [name]: value },
        fetchImpl,
      }),
      (error) => !String(error.message).includes(value ?? '\0')
    );
    assert.equal(
      calls.length,
      0,
      `${name} must stop the run before the provider`
    );
  }
});

test('writes the required bindings alone when the optional coordination secrets are absent', async () => {
  const { calls, fetchImpl } = provider();
  const lines = await writeSecrets({
    token: 't',
    env: REQUIRED_ONLY,
    fetchImpl,
  });

  assert.deepEqual(
    calls
      .filter((call) => call.method === 'PUT')
      .map((call) => JSON.parse(call.body).name),
    [...REQUIRED]
  );
  assert.deepEqual(lines, [
    ...REQUIRED.map((name) => `${WORKER}: ${name} (secret_text)`),
    ...OPTIONAL.map((name) => `${WORKER}: ${name} not set (optional)`),
  ]);
});

test('a missing required value stops the run before the provider', async () => {
  for (const binding of REQUIRED) {
    const { calls, fetchImpl } = provider();
    await assert.rejects(
      writeSecrets({
        token: 't',
        env: { ...VALUES, [SOURCES[binding]]: '' },
        fetchImpl,
      }),
      new RegExp(`${binding} is unset`)
    );
    assert.equal(calls.length, 0);
  }
});

test('allows the two coordination secrets to hold one shared value', async () => {
  const { fetchImpl } = provider();
  const lines = await writeSecrets({
    token: 't',
    env: {
      ...VALUES,
      APP_COORDINATION_TOKEN_SECRET: VALUES.TUTURUUU_APP_COORDINATION_SECRET,
    },
    fetchImpl,
  });
  assert.equal(lines.length, BINDINGS.length);
});

test('refuses to reuse one value for two required bindings', async () => {
  const { calls, fetchImpl } = provider();
  await assert.rejects(
    writeSecrets({
      token: 't',
      env: {
        ...VALUES,
        PRODUCTION_SUPABASE_SECRET_KEY:
          VALUES.PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
      },
      fetchImpl,
    }),
    /share one value/
  );
  assert.equal(calls.length, 0);
});

test('stops when the Worker has not been uploaded yet, without writing', async () => {
  const { calls, fetchImpl } = provider({ exists: false });
  await assert.rejects(
    writeSecrets({ token: 't', env: VALUES, fetchImpl }),
    /not uploaded yet/
  );
  assert.deepEqual(
    calls.map((call) => call.method),
    ['GET']
  );
});

test('a rejected lookup is reported as such, not as a missing upload', async () => {
  const fetchImpl = async () => new Response('{}', { status: 403 });
  await assert.rejects(
    writeSecrets({ token: 't', env: VALUES, fetchImpl }),
    /lookup failed with HTTP 403/
  );
});

test('verification accepts a Worker without the optional bindings', async () => {
  const { fetchImpl } = provider({
    stored: new Map(REQUIRED.map((name) => [name, 'secret_text'])),
  });
  assert.deepEqual(await verifySecrets({ token: 't', fetchImpl }), [
    ...REQUIRED.map((name) => `${WORKER}: ${name} (secret_text)`),
    ...OPTIONAL.map((name) => `${WORKER}: ${name} not set (optional)`),
  ]);
});

test('verification fails closed on a missing or wrongly typed binding', async () => {
  const missing = provider({ stored: new Map([[BINDINGS[0], 'secret_text']]) });
  await assert.rejects(
    verifySecrets({ token: 't', fetchImpl: missing.fetchImpl }),
    /exactly one/
  );
  const typed = provider({
    stored: new Map(BINDINGS.map((name) => [name, 'plain_text'])),
  });
  await assert.rejects(
    verifySecrets({ token: 't', fetchImpl: typed.fetchImpl }),
    /wrong type/
  );
});

test('a provider failure reports the HTTP status and codes, never the body', async () => {
  const fetchImpl = async (url, init = {}) =>
    String(url).endsWith('/settings')
      ? new Response('{}', { status: 200 })
      : new Response(
          JSON.stringify({
            errors: [
              { code: 10000, message: VALUES.PRODUCTION_SUPABASE_SECRET_KEY },
            ],
          }),
          { status: 403 }
        );
  await assert.rejects(
    writeSecrets({ token: 't', env: VALUES, fetchImpl }),
    (error) =>
      /HTTP 403 \(codes 10000\)/.test(error.message) &&
      !error.message.includes(VALUES.PRODUCTION_SUPABASE_SECRET_KEY)
  );
});
