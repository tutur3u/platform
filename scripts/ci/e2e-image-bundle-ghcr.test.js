const assert = require('node:assert/strict');
const test = require('node:test');
const {
  cleanupBundle,
  githubRequest,
  listPackageVersions,
} = require('./e2e-image-bundle-ghcr.js');

const env = { GITHUB_TOKEN: 'synthetic-token' };
const repository = 'ghcr.io/tutur3u/platform-e2e';
const json = (data) => new Response(JSON.stringify(data), { status: 200 });

for (const status of [500, 502, 503, 504]) {
  test(`safe GET recovers ${status} with bounded backoff`, async () => {
    let calls = 0;
    const delays = [];
    const result = await githubRequest('/versions', {
      env,
      fetch: async (_, options) => {
        assert.equal(options.method, 'GET');
        assert.ok(options.signal instanceof AbortSignal);
        return ++calls < 3 ? new Response('', { status }) : json([{ id: 1 }]);
      },
      sleep: async (delay) => delays.push(delay),
    });
    assert.deepEqual(result, [{ id: 1 }]);
    assert.equal(calls, 3);
    assert.deepEqual(delays, [1000, 2000]);
  });
}

test('safe GET retries transport failure but preserves exhausted cause', async () => {
  const failure = new TypeError('synthetic connection reset');
  let calls = 0;
  const delays = [];
  await assert.rejects(
    githubRequest('/versions', {
      env,
      fetch: async () => {
        calls++;
        throw failure;
      },
      sleep: async (delay) => delays.push(delay),
    }),
    (error) => error === failure
  );
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

for (const status of [401, 403, 429]) {
  test(`GET does not retry authorization/rate-limit ${status}`, async () => {
    let calls = 0;
    await assert.rejects(
      githubRequest('/versions', {
        env,
        fetch: async () => {
          calls++;
          return new Response('', { status });
        },
        sleep: async () => assert.fail('must not retry'),
      }),
      new RegExp(`failed \\(${status}\\)`)
    );
    assert.equal(calls, 1);
  });
}

test('GET keeps missing-package 404 semantics and DELETE has no nested retry', async () => {
  assert.equal(
    await githubRequest('/package', {
      env,
      fetch: async () => new Response('', { status: 404 }),
    }),
    null
  );
  let calls = 0;
  await assert.rejects(
    githubRequest('/versions/1', {
      env,
      method: 'DELETE',
      fetch: async (_, options) => {
        assert.equal('signal' in options, false);
        calls++;
        return new Response('', { status: 500 });
      },
      sleep: async () => assert.fail('must not retry DELETE here'),
    }),
    /failed \(500\)/
  );
  assert.equal(calls, 1);
});

function paginatedRequest({ failAlways = false }) {
  let lastPageAttempts = 0;
  const seenPages = [];
  return {
    request: (pathname, options) =>
      githubRequest(pathname, {
        ...options,
        sleep: async () => {},
        fetch: async (raw) => {
          const page = Number(new URL(raw).searchParams.get('page'));
          seenPages.push(page);
          if (page === 27 && (++lastPageAttempts === 1 || failAlways)) {
            return new Response('', { status: 500 });
          }
          const length = page < 27 ? 100 : 1;
          return json(
            Array.from({ length }, (_, index) => ({
              id: (page - 1) * 100 + index + 1,
              created_at: '2020-01-01T00:00:00Z',
              metadata: { container: { tags: ['1-1-abcdef0-web'] } },
            }))
          );
        },
      }),
    seenPages,
  };
}

test('page-27 500 recovery retains every prior page exactly once', async () => {
  const fake = paginatedRequest({});
  const versions = await listPackageVersions(repository, env, fake.request);
  assert.equal(versions.length, 2601);
  assert.equal(new Set(versions.map((row) => row.id)).size, 2601);
  assert.deepEqual(fake.seenPages.slice(-3), [26, 27, 27]);
});

test('exhausted later-page 500 fails closed before any package deletion', async () => {
  const fake = paginatedRequest({ failAlways: true });
  let deleted = 0;
  await assert.rejects(
    cleanupBundle(
      { repository, staleHours: 24 },
      {
        env,
        listVersions: (repo, context) =>
          listPackageVersions(repo, context, fake.request),
        removeVersion: async () => {
          deleted++;
        },
      }
    ),
    /page=27 failed \(500\)/
  );
  assert.equal(deleted, 0);
  assert.deepEqual(fake.seenPages.slice(-3), [27, 27, 27]);
});

for (const status of [200, 500]) {
  test(`safe GET retries interrupted ${status} response body`, async () => {
    let calls = 0;
    const result = await githubRequest('/versions', {
      env,
      sleep: async () => {},
      fetch: async () =>
        ++calls < 3
          ? {
              status,
              ok: status === 200,
              text: async () => {
                throw new TypeError('body reset');
              },
            }
          : json([{ id: 1 }]),
    });
    assert.deepEqual(result, [{ id: 1 }]);
    assert.equal(calls, 3);
  });
}
for (const status of [401, 403, 429]) {
  test(`GET ${status} body failure never retries`, async () => {
    let calls = 0;
    await assert.rejects(
      githubRequest('/versions', {
        env,
        sleep: async () => assert.fail('must not retry'),
        fetch: async () => {
          calls++;
          return {
            status,
            ok: false,
            text: async () => {
              throw new TypeError('body reset');
            },
          };
        },
      }),
      /body reset/
    );
    assert.equal(calls, 1);
  });
}
test('malformed successful JSON is not a transient body error', async () => {
  let calls = 0;
  await assert.rejects(
    githubRequest('/versions', {
      env,
      sleep: async () => assert.fail('must not retry'),
      fetch: async () => {
        calls++;
        return new Response('{', { status: 200 });
      },
    }),
    SyntaxError
  );
  assert.equal(calls, 1);
});
test('exhausted successful body reset preserves cause and DELETE never retries', async () => {
  for (const method of ['GET', 'DELETE']) {
    const failure = new TypeError('body reset');
    let calls = 0;
    await assert.rejects(
      githubRequest('/versions', {
        env,
        method,
        sleep: async () => {},
        fetch: async () => {
          calls++;
          return {
            status: 200,
            ok: true,
            text: async () => {
              throw failure;
            },
          };
        },
      }),
      (error) => error === failure
    );
    assert.equal(calls, method === 'GET' ? 3 : 1);
  }
});
