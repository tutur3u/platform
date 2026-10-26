import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { captureState, validateCaptureOptions } from './capture.mjs';
import { matchesRoute } from './route-pattern.mjs';

const host = 'tasks.tuturuuu.com';
const options = {
  host,
  'vercel-project': 'tasks',
  'cf-zone-id': 'a'.repeat(32),
};
const token = 'synthetic-readonly-test-credential';
const zoneRoutes = [
  { id: 'exact', pattern: `${host}/*`, script: 'tasks' },
  { id: 'zone', pattern: '*.tuturuuu.com/*', script: 'shared' },
  { id: 'suffix', pattern: `*${host}/*`, script: 'suffix' },
  { id: 'path', pattern: `${host}/private/*`, script: null },
  { id: 'other', pattern: 'mail.tuturuuu.com/*', script: 'mail' },
];
function dependencies(overrides = {}) {
  return {
    env: { CLOUDFLARE_READONLY_API_TOKEN: token },
    dnsImpl: {
      resolveCname: async () => ['origin.example.com'],
      resolve4: async () => ['192.0.2.1'],
      resolve6: async () => [],
      resolveNs: async () => ['ns.example.com'],
    },
    spawnImpl: (_command, args) => ({
      status: 0,
      stdout: args[0] === 'ls' ? 'https://synthetic.vercel.app' : '',
      stderr: args[0] === 'inspect' ? 'id dpl_synthetic\ncreated today' : '',
    }),
    fetchImpl: async (url) => {
      if (url.includes('/workers/routes'))
        return Response.json({ success: true, result: zoneRoutes });
      if (url.includes('/dns_records'))
        return Response.json({ success: true, result: [] });
      return new Response('ok');
    },
    ...overrides,
  };
}

test('capture retains every zone route, including unrelated hosts and exclusions', async () => {
  const capture = await captureState(options, dependencies());
  assert.deepEqual(capture.cloudflare.workerRoutes, {
    ok: true,
    value: zoneRoutes,
  });
  assert.equal(capture.vercel.value.deploymentId, 'dpl_synthetic');
  assert.equal(capture.edge.ok, true);
});

test('credential appears only in Cloudflare Authorization headers', async () => {
  const requests = [];
  const deps = dependencies();
  const capture = await captureState(options, {
    ...deps,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      assert.equal(url.includes(token), false);
      if (new URL(url).hostname === 'api.cloudflare.com') {
        assert.deepEqual(init, {
          headers: { authorization: `Bearer ${token}` },
          redirect: 'error',
        });
      } else {
        assert.equal(JSON.stringify(init).includes(token), false);
      }
      return deps.fetchImpl(url, init);
    },
    spawnImpl: (command, args, init) => {
      assert.equal(
        JSON.stringify({ command, args, init }).includes(token),
        false
      );
      return deps.spawnImpl(command, args, init);
    },
  });
  assert.equal(requests.length, 3);
  const dnsRequest = new URL(
    requests.find(({ url }) => url.includes('/dns_records')).url
  );
  assert.equal(dnsRequest.searchParams.get('name'), host);
  assert.equal(JSON.stringify(capture).includes(token), false);
});

for (const failure of ['transport', 'api', 'decode', 'http']) {
  test(`Cloudflare ${failure} failure cannot echo the credential`, async () => {
    const capture = await captureState(
      options,
      dependencies({
        fetchImpl: async (url) => {
          if (!url.includes('api.cloudflare.com')) return new Response('ok');
          if (failure === 'transport')
            throw new Error(`Authorization: Bearer ${token}`);
          if (failure === 'decode')
            return {
              json: async () => {
                throw new Error(token);
              },
            };
          return Response.json(
            { success: failure === 'http', errors: [token] },
            {
              status: failure === 'http' ? 403 : 200,
            }
          );
        },
      })
    );
    assert.equal(capture.cloudflare.workerRoutes.ok, false);
    assert.equal(capture.cloudflare.dnsRecords.ok, false);
    assert.equal(JSON.stringify(capture).includes(token), false);
  });
}

test('provider success data and CLI errors redact an echoed credential', async () => {
  const capture = await captureState(
    options,
    dependencies({
      fetchImpl: async () =>
        Response.json({ success: true, result: [{ pattern: token }] }),
      spawnImpl: () => ({ status: 1, stderr: `failure ${token}` }),
    })
  );
  assert.equal(JSON.stringify(capture).includes(token), false);
  assert.match(capture.vercel.error, /REDACTED/u);
  assert.equal(capture.cloudflare.workerRoutes.value[0].pattern, '[REDACTED]');
});

test('generic Cloudflare token is never used as a fallback', async () => {
  let requests = 0;
  const capture = await captureState(
    options,
    dependencies({
      env: { CLOUDFLARE_API_TOKEN: token },
      fetchImpl: async () => {
        requests++;
        return new Response('ok');
      },
    })
  );
  assert.equal(requests, 1);
  assert.match(capture.cloudflare.skipped, /CLOUDFLARE_READONLY_API_TOKEN/u);
});

test('Vercel stderr retained in failed capture is bounded', async () => {
  const capture = await captureState(
    options,
    dependencies({
      spawnImpl: () => ({ status: 1, stderr: 'x'.repeat(20_000) }),
    })
  );
  assert.equal(capture.vercel.ok, false);
  assert.equal(capture.vercel.error.length, 2_000);
});

test('invalid host and zone IDs fail before I/O and omit input values', async () => {
  let calls = 0;
  for (const values of [
    ...[
      'https://tasks.tuturuuu.com',
      'tasks.tuturuuu.com?x=y',
      'a/b',
      '*.example.com',
      '-bad.example.com',
      'bad-.example.com',
      'a..com',
      'a_b.example.com',
      `${'a'.repeat(64)}.com`,
      'localhost',
      'example.com\n',
    ].map((host) => ({ ...options, host })),
    ...[
      'x'.repeat(32),
      'a'.repeat(31),
      'A'.repeat(32),
      '../zones/other',
      `${'a'.repeat(32)}\n`,
      '',
    ].map((zone) => ({ ...options, 'cf-zone-id': zone })),
  ]) {
    await assert.rejects(
      captureState(
        values,
        dependencies({
          fetchImpl: async () => {
            calls++;
            throw new Error('unexpected I/O');
          },
          spawnImpl: () => {
            calls++;
          },
        })
      ),
      /must be/u
    );
  }
  assert.equal(calls, 0);
  assert.doesNotThrow(() =>
    validateCaptureOptions({ ...options, host: 'Tasks.Tuturuuu.com' })
  );
});

for (const [pattern, url, expected] of [
  ['tasks.tuturuuu.com', `https://${host}/`, true],
  ['tasks.tuturuuu.com', `https://${host}/path`, false],
  ['tasks.tuturuuu.com/*', `https://${host}/`, true],
  ['*.tuturuuu.com/*', `https://${host}/path`, true],
  ['*.tuturuuu.com/*', 'https://tuturuuu.com/', false],
  ['*.tuturuuu.com/*', 'https://nottuturuuu.com/', false],
  ['*.tasks.tuturuuu.com/*', `https://${host}/`, false],
  ['*tasks.tuturuuu.com/*', `https://${host}/`, true],
  ['*tasks.tuturuuu.com/*', 'https://nottasks.tuturuuu.com/', true],
  ['*tasks.tuturuuu.com/*', 'https://nested.tasks.tuturuuu.com/', true],
  ['tasks.tuturuuu.com/*', 'https://mail.tuturuuu.com/', false],
  ['tasks.tuturuuu.com/*', 'https://tasks.tuturuuu.com.evil.example/', false],
  ['https://tasks.tuturuuu.com/*', `http://${host}/`, false],
  ['tasks.tuturuuu.com/*', `http://${host}/`, true],
  ['TASKS.TUTURUUU.COM/*', `https://${host}/`, true],
  ['tasks.tuturuuu.com/path*', `https://${host}/path`, true],
  ['tasks.tuturuuu.com/path*', `https://${host}/path2?n=1`, true],
  ['tasks.tuturuuu.com/path/*', `https://${host}/path/nested`, true],
  ['tasks.tuturuuu.com/path/*', `https://${host}/other`, false],
  ['tasks.tuturuuu.com/Path/*', `https://${host}/path/nested`, false],
  ['tasks.tuturuuu.com/path', `https://${host}/path?n=1`, false],
  ['tasks.tuturuuu.com/path*', `https://${host}/path?n=1`, true],
  ['tasks.tuturuuu.com/*.jpg', `https://${host}/image.jpg`, false],
]) {
  test(`route ${pattern} against ${url} is ${expected}`, () => {
    assert.equal(matchesRoute(pattern, url), expected);
  });
}

test('redaction happens before stderr truncation', async () => {
  const capture = await captureState(
    options,
    dependencies({
      spawnImpl: () => ({ status: 1, stderr: `${'x'.repeat(1990)}${token}` }),
    })
  );
  assert.equal(capture.vercel.error.includes('synthetic'), false);
});

test('CLI invalid input prints neither the credential nor the invalid input', () => {
  const result = spawnSync(
    process.execPath,
    [
      new URL('./capture.mjs', import.meta.url).pathname,
      '--host',
      `https://${token}.example.com`,
      '--vercel-project',
      'tasks',
    ],
    {
      encoding: 'utf8',
      env: { CLOUDFLARE_READONLY_API_TOKEN: token },
    }
  );
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.includes(token), false);
  assert.match(result.stderr, /Capture failed/u);
});

test('successful Vercel stderr remains complete while extracting deployment identity', async () => {
  const deps = dependencies();
  const capture = await captureState(options, {
    ...deps,
    spawnImpl: (command, args, init) => ({
      ...deps.spawnImpl(command, args, init),
      stdout: '',
      stderr: `${' '.repeat(3000)}${args[0] === 'ls' ? 'https://synthetic.vercel.app' : 'id dpl_synthetic'}`,
    }),
  });
  assert.equal(capture.vercel.value.deploymentId, 'dpl_synthetic');
});
