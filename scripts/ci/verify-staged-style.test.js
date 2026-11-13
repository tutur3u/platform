const assert = require('node:assert/strict');
const test = require('node:test');
const {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { basename, dirname, join, resolve } = require('node:path');
const {
  FAILURE_REASONS,
  describeFailure,
  main,
  proofDirectory,
  responseHeaders,
  safeEnvironment,
  verifyCss,
  writeProof,
} = require('./verify-staged-style');
const { readWorkflow } = require('./workflow-yaml-test-helper');

test('preserves staged CSP and MIME without forwarding deployment cookies or compressed lengths', () => {
  const headers = responseHeaders(
    'HTTP/1.1 200 Connection established\r\n\r\nHTTP/2 200\r\nContent-Type: text/css\r\nContent-Security-Policy: default-src self\r\nSet-Cookie: sensitive=stub\r\nContent-Encoding: gzip\r\nContent-Length: 10\r\n\r\n'
  );
  assert.deepEqual(headers, {
    'content-type': 'text/css',
    'content-security-policy': 'default-src self',
  });
  assert.throws(() => responseHeaders('not a response'), /headers/);
});

test('browser children receive no deployment, GitHub or arbitrary secret environment', () => {
  assert.deepEqual(
    safeEnvironment({
      PATH: '/bin',
      HOME: '/fixture',
      VERCEL_TOKEN: 'stub',
      GITHUB_TOKEN: 'stub',
      GH_TOKEN: 'stub',
      CUSTOM_SECRET: 'stub',
    }),
    { PATH: '/bin', HOME: '/fixture' }
  );
});

test('CSS must match the exact built asset and cannot escape its artifact root', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'staged-css-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactRoot = resolve(root, 'static');
  const file = resolve(artifactRoot, '_next/static/chunks/site.css');
  const body = Buffer.from('.flex{display:flex}.p-4{padding:1rem}');
  await mkdir(resolve(file, '..'), { recursive: true });
  await writeFile(file, body);
  const input = {
    artifactRoot,
    pathname: '/_next/static/chunks/site.css',
    body,
    contentType: 'text/css; charset=utf-8',
  };
  const proof = await verifyCss(input);
  assert.equal(proof.expectedBytes, body.length);
  assert.equal(proof.bytes, body.length);
  assert.match(proof.sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(
    verifyCss({ ...input, body: Buffer.from('.flex{}') }),
    /bytes differ/
  );
  await assert.rejects(
    verifyCss({ ...input, contentType: 'text/html' }),
    /content type/
  );
  await assert.rejects(
    verifyCss({ ...input, pathname: '/api/private.css' }),
    /outside/
  );
  await assert.rejects(
    verifyCss({ ...input, pathname: '/_next/static/../../../secret.css' })
  );
  const outside = resolve(root, 'outside.css');
  await writeFile(outside, body);
  await symlink(outside, resolve(artifactRoot, '_next/static/escape.css'));
  await assert.rejects(
    verifyCss({ ...input, pathname: '/_next/static/escape.css' }),
    /escapes/
  );
  await writeFile(file, '');
  await assert.rejects(
    verifyCss({ ...input, body: Buffer.alloc(0) }),
    /bytes differ/
  );
});

test('platform promotion requires staged CSS and uploaded 390/1440 proof first', () => {
  const workflow = readWorkflow('vercel-production-platform.yaml');
  const steps = workflow.jobs['Deploy-Production'].steps;
  const stage = steps.findIndex((s) => s.id === 'stage_deployment');
  const auth = steps.findIndex(
    (s) => s.run === 'node scripts/ci/verify-staged-critical-app.js'
  );
  const style = steps.findIndex(
    (s) => s.run === 'node scripts/ci/verify-staged-style.js'
  );
  const upload = steps.findIndex((s) => s.name === 'Retain staged style proof');
  const promote = steps.findIndex((s) => s.id === 'promote');
  assert.ok(stage < auth && auth < style && style < upload && upload < promote);
  assert.equal(steps[style]['continue-on-error'], undefined);
  assert.equal(steps[upload]['continue-on-error'], undefined);
  assert.equal(
    steps[style].env.VERCEL_STAGED_DEPLOYMENT_URL,
    '${{ steps.stage_deployment.outputs.url }}'
  );
  assert.equal(steps[style].env.VERCEL_STAGED_APP, 'platform');
  assert.ok(steps[upload].with.path.includes('staged-style-proof'));
});

test('failure descriptions use only listed reasons, never raw error text', () => {
  assert.equal(
    describeFailure(
      new Error('Staged CSS bytes differ from the built artifact')
    ),
    'Staged CSS bytes differ from the built artifact'
  );
  assert.equal(
    describeFailure(
      new Error('page.evaluate: Error: Unverified stylesheet\n    at stack')
    ),
    'Unverified stylesheet'
  );
  const leaked = describeFailure(
    Object.assign(
      new Error('Command failed: vercel curl --token SECRET-VALUE'),
      {
        code: 1,
      }
    )
  );
  assert.equal(leaked, 'Unclassified Error:exit-1');
  assert.equal(
    describeFailure(
      Object.assign(new Error('SECRET-VALUE'), { code: 'ETIMEDOUT' })
    ),
    'Unclassified Error:ETIMEDOUT'
  );
  assert.equal(describeFailure(undefined), 'Unclassified Error');
});

test('every reason the script raises is listed for reporting', async () => {
  const source = await readFile(
    resolve(__dirname, 'verify-staged-style.js'),
    'utf8'
  );
  const raised = [
    ...source.matchAll(/new Error\(\s*'([^']+)'/gu),
    ...source.matchAll(/^\s*'((?:Candidate|Staged|An exact)[^']+)'\s*$/gmu),
  ].map((match) => match[1]);
  assert.ok(raised.length >= FAILURE_REASONS.length - 1);
  for (const reason of raised)
    assert.ok(FAILURE_REASONS.includes(reason), reason);
});

test('a failed proof logs its reason and still leaves evidence to upload', async (t) => {
  const temp = await mkdtemp(resolve(tmpdir(), 'staged-failure-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const sha = 'a'.repeat(40);
  const runCommand = async () => {
    throw Object.assign(new Error('Command failed: vercel curl SECRET-VALUE'), {
      code: 1,
    });
  };
  const env = {
    VERCEL_STAGED_DEPLOYMENT_URL: 'https://platform-fixture.vercel.app',
    VERCEL_STAGED_APP: 'platform',
    VERCEL_TOKEN: 'SECRET-VALUE',
    GITHUB_SHA: sha,
    RUNNER_TEMP: temp,
  };
  await assert.rejects(main({ env, runCommand }), (error) => {
    assert.equal(error.stagedReason, 'Unclassified Error:exit-1');
    return true;
  });
  const text = await readFile(
    resolve(temp, 'staged-style-proof', sha, 'failure.json'),
    'utf8'
  );
  assert.deepEqual(JSON.parse(text), {
    source: sha,
    deployment: 'https://platform-fixture.vercel.app',
    stage: 'identity',
    reason: 'Unclassified Error:exit-1',
    resourceFailures: [],
  });
  assert.ok(!text.includes('SECRET-VALUE'));
});

test('a step killed mid-run still leaves the last stage in the evidence', async (t) => {
  const temp = await mkdtemp(resolve(tmpdir(), 'staged-stage-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const sha = 'b'.repeat(40);
  const env = {
    VERCEL_STAGED_DEPLOYMENT_URL: 'https://platform-fixture.vercel.app',
    VERCEL_STAGED_APP: 'platform',
    VERCEL_TOKEN: 'SECRET-VALUE',
    GITHUB_SHA: sha,
    RUNNER_TEMP: temp,
  };
  const evidence = resolve(temp, 'staged-style-proof', sha);
  const never = () => new Promise(() => {});
  main({ env, runCommand: never }).catch(() => {});
  let text;
  for (let attempt = 0; attempt < 200 && !text; attempt += 1) {
    text = await readFile(resolve(evidence, 'stage.json'), 'utf8').catch(
      () => undefined
    );
    if (!text) await new Promise((done) => setTimeout(done, 10));
  }
  assert.ok(text, 'stage.json is written before any command can hang');
  const record = JSON.parse(text);
  assert.deepEqual(Object.keys(record).sort(), ['at', 'stage']);
  assert.equal(record.stage, 'identity');
  assert.ok(Number.isFinite(Date.parse(record.at)));
  assert.ok(!text.includes('SECRET-VALUE'));
  await assert.rejects(readFile(resolve(evidence, 'failure.json')), /ENOENT/);
});

test('unset RUNNER_TEMP keeps the proof in a private random directory', async (t) => {
  const sha = 'c'.repeat(40);
  const evidence = proofDirectory({ sha });
  const base = dirname(evidence);
  t.after(() => rm(base, { recursive: true, force: true }));
  assert.equal(basename(evidence), sha);
  assert.match(basename(base), /^staged-style-proof-[A-Za-z0-9]{6}$/);
  assert.notEqual(evidence, join(tmpdir(), 'staged-style-proof', sha));
  assert.equal((await stat(base)).mode & 0o777, 0o700);
  assert.equal((await stat(evidence)).mode & 0o777, 0o700);
  const outside = join(base, 'outside.txt');
  await writeFile(outside, 'kept');
  await symlink(outside, join(evidence, 'stage.json'));
  await writeProof(
    evidence,
    'stage.json',
    `${JSON.stringify({ stage: 'identity' })}\n`
  );
  assert.equal(await readFile(outside, 'utf8'), 'kept');
  const written = await lstat(join(evidence, 'stage.json'));
  assert.equal(written.isSymbolicLink(), false);
  assert.equal(written.isFile(), true);
  assert.equal(written.mode & 0o777, 0o600);
  assert.equal(
    await readFile(join(evidence, 'stage.json'), 'utf8'),
    `${JSON.stringify({ stage: 'identity' })}\n`
  );
});

test('every stage change is recorded through one helper', async () => {
  const source = await readFile(
    resolve(__dirname, 'verify-staged-style.js'),
    'utf8'
  );
  const assignments = [...source.matchAll(/^\s*stage = /gmu)];
  assert.equal(assignments.length, 1, 'only the helper assigns the stage');
  assert.match(source, /await markStage\('browser'\)/u);
  assert.match(source, /await markStage\(`viewport-\$\{width\}`\)/u);
  assert.match(source, /await markStage\('receipt'\)/u);
});

for (const [name, status, host, accepted] of [
  ['missing response', null, 'platform-fixture.vercel.app', false],
  ['non-200 response', 503, 'platform-fixture.vercel.app', false],
  ['off-origin response', 200, 'elsewhere.example', false],
  ['same-origin 200', 200, 'platform-fixture.vercel.app', true],
]) {
  test(`navigation evidence identifies ${name} without URL secrets`, async (t) => {
    const temp = await mkdtemp(resolve(tmpdir(), 'staged-navigation-test-'));
    t.after(() => rm(temp, { recursive: true, force: true }));
    const sha = 'd'.repeat(40);
    const origin = 'https://platform-fixture.vercel.app';
    const finalUrl = `https://USER-SECRET:PASSWORD-SECRET@${host}/en?token=QUERY-SECRET#FRAGMENT-SECRET`;
    let evaluated = 0;
    let closed = 0;
    const page = {
      setViewportSize: async (size) => {
        assert.deepEqual(size, { width: 390, height: 900 });
      },
      goto: async (url, options) => {
        assert.equal(url, `${origin}/en`);
        assert.deepEqual(options, { waitUntil: 'load', timeout: 60000 });
        return status === null ? null : { status: () => status };
      },
      url: () => finalUrl,
      evaluate: async () => {
        evaluated += 1;
        return {};
      },
    };
    const browserType = {
      launch: async () => ({
        newContext: async () => ({
          route: async () => {},
          newPage: async () => page,
        }),
        close: async () => {
          closed += 1;
        },
      }),
    };
    const runCommand = async (command, args) => {
      assert.equal(command, 'vercel');
      assert.ok(['/api/build-info', '/en'].includes(args[1]));
      await writeFile(
        args[args.indexOf('--dump-header') + 1],
        'HTTP/2 200\r\n\r\n'
      );
      await writeFile(
        args[args.indexOf('--output') + 1],
        JSON.stringify({
          commitHash: sha,
          appName: 'web',
          environment: 'production',
        })
      );
      return { stdout: '\nTTR_HTTP_STATUS:200' };
    };
    const reason = accepted
      ? 'Candidate CSS did not verify against built bytes'
      : 'Staged public page failed or left the candidate';
    await assert.rejects(
      main({
        env: {
          VERCEL_STAGED_DEPLOYMENT_URL: origin,
          VERCEL_STAGED_APP: 'platform',
          VERCEL_TOKEN: 'TOKEN-SECRET',
          GITHUB_SHA: sha,
          RUNNER_TEMP: temp,
        },
        runCommand,
        browserType,
      }),
      (error) => error.stagedReason === reason
    );
    const proof = join(temp, 'staged-style-proof', sha, 'failure.json');
    const text = await readFile(proof, 'utf8');
    const failure = JSON.parse(text);
    assert.equal(failure.stage, 'viewport-390');
    assert.equal(failure.reason, reason);
    assert.deepEqual(failure.resourceFailures, []);
    assert.deepEqual(failure.navigation, {
      responsePresent: status !== null,
      status,
      finalOrigin: `https://${host}`,
      finalPath: '/en',
      http200: status === 200,
      sameCandidateOrigin: host === 'platform-fixture.vercel.app',
    });
    assert.equal(evaluated, accepted ? 1 : 0);
    assert.equal(closed, 1);
    assert.equal(page.url(), finalUrl);
    assert.equal((await stat(proof)).mode & 0o777, 0o600);
    assert.ok(!text.includes('SECRET'));
    await assert.rejects(
      readFile(join(dirname(proof), 'receipt.json')),
      /ENOENT/
    );
  });
}

// This browser seam deliberately does not re-route a fulfilled redirect, matching
// Chromium's continuation behavior. A raw 3xx must never reach fulfill.
async function transportFixture(t, responses, stamp) {
  const temp = await mkdtemp(join(tmpdir(), 'staged-transport-test-'));
  const previous = process.cwd();
  process.chdir(temp);
  t.after(async () => {
    process.chdir(previous);
    await rm(temp, { recursive: true, force: true });
  });
  const origin = 'https://platform-fixture.vercel.app';
  const sha = 'e'.repeat(40);
  const cssPath = '/_next/static/chunks/site.css';
  const cssBody = '.flex{display:flex}';
  await mkdir(join(temp, '.vercel/output/static/_next/static/chunks'), {
    recursive: true,
  });
  await writeFile(join(temp, '.vercel/output/static', cssPath), cssBody);
  const calls = [],
    navigations = [],
    fulfilled = [],
    blocked = [];
  let handler;
  const dispatch = async (url, type = 'document', method = 'GET') => {
    let result;
    await handler({
      request: () => ({
        url: () => url,
        method: () => method,
        resourceType: () => type,
      }),
      abort: async () => {
        blocked.push(url);
      },
      fulfill: async (value) => {
        assert.ok(
          value.status < 300 || value.status >= 400,
          'unguarded browser redirect'
        );
        fulfilled.push(url);
        result = value;
      },
    });
    return result;
  };
  const browserType = {
    launch: async (options) => {
      assert.equal(options.env.VERCEL_TOKEN, undefined);
      return {
        close: async () => {},
        newContext: async () => ({
          route: async (_, callback) => {
            handler = callback;
          },
          newPage: async () => {
            let current;
            return {
              setViewportSize: async () => {},
              goto: async (url) => {
                current = url;
                navigations.push(url);
                const result = await dispatch(url);
                if (!result) return null;
                if (result.status === 200) {
                  await dispatch(new URL('banner.svg', url).href, 'image');
                  await dispatch(origin + cssPath, 'stylesheet');
                }
                return { status: () => result.status };
              },
              url: () => current,
              evaluate: async () => ({
                ruleCount: 1,
                fontFailures: 0,
                compared: [{ path: cssPath, expectedRules: 1, servedRules: 1 }],
                utility: { display: 'flex', gap: 16, padding: 16, radius: 8 },
              }),
              screenshot: async ({ path }) => writeFile(path, 'fixture'),
              close: async () => {},
            };
          },
        }),
      };
    },
  };
  const env = {
    VERCEL_STAGED_DEPLOYMENT_URL: origin,
    VERCEL_STAGED_APP: 'platform',
    VERCEL_TOKEN: 'FIXTURE-SECRET',
    GITHUB_SHA: sha,
    RUNNER_TEMP: temp,
  };
  const runCommand = async (command, args, options) => {
    assert.equal(command, 'vercel');
    assert.equal(args[0], 'curl');
    assert.equal(options.env.VERCEL_TOKEN, env.VERCEL_TOKEN);
    assert.equal(args[args.indexOf('--deployment') + 1], origin);
    assert.ok(!args.includes('--location') && !args.includes('-L'));
    assert.ok(!JSON.stringify(args).includes('SECRET'));
    calls.push(args[1]);
    const response =
      args[1] === '/api/build-info'
        ? (stamp ?? {
            body: JSON.stringify({
              commitHash: sha,
              appName: 'web',
              environment: 'production',
            }),
          })
        : (responses(args[1]) ??
          (args[1] === cssPath
            ? { body: cssBody, type: 'text/css' }
            : { body: '<html></html>' }));
    const status = response.status ?? 200;
    await writeFile(
      args[args.indexOf('--dump-header') + 1],
      `HTTP/2 ${status}\r\nContent-Type: ${response.type ?? 'text/html'}\r\n${response.location === undefined ? '' : `Location: ${response.location}\r\n`}\r\n`
    );
    await writeFile(args[args.indexOf('--output') + 1], response.body ?? '');
    return { stdout: `\nTTR_HTTP_STATUS:${status}` };
  };
  return {
    origin,
    calls,
    navigations,
    fulfilled,
    blocked,
    dispatch,
    run: () => main({ env, runCommand, browserType }),
    failure: async () =>
      readFile(join(temp, 'staged-style-proof', sha, 'failure.json'), 'utf8'),
  };
}

test('exported verifier follows relative and absolute page hops through authenticated curl at the final base URL', async (t) => {
  const f = await transportFixture(
    t,
    (path) =>
      ({
        '/en': { status: 302, location: 'welcome/' },
        '/welcome/': {
          status: 307,
          location: 'https://platform-fixture.vercel.app/en/final/',
        },
      })[path]
  );
  const proof = await f.run();
  assert.equal(proof.viewports.length, 2);
  assert.deepEqual(f.navigations, [
    f.origin + '/en/final/',
    f.origin + '/en/final/',
  ]);
  assert.equal(f.calls.filter((p) => p === '/en').length, 2);
  assert.equal(f.calls.filter((p) => p === '/welcome/').length, 2);
  assert.equal(f.calls.filter((p) => p === '/en/final/').length, 2);
  assert.equal(f.calls.filter((p) => p === '/en/final/banner.svg').length, 2);
  assert.equal(
    f.calls.filter((p) => p === '/_next/static/chunks/site.css').length,
    2
  );
  assert.deepEqual(f.blocked, []);
  const before = f.calls.length;
  await f.dispatch(f.origin + '/en', 'fetch', 'POST');
  await f.dispatch(f.origin + '/api', 'fetch');
  await f.dispatch('https://elsewhere.example/en', 'image');
  assert.equal(f.calls.length, before);
  assert.equal(f.blocked.length, 3);
});

for (const [name, location] of [
  ['foreign origin', 'https://elsewhere.example/SECRET'],
  ['API root', '/api'],
  ['API child', '/api/private'],
  ['encoded API', '/%61pi/private'],
  [
    'credentials',
    'https://USER-SECRET:PASS-SECRET@platform-fixture.vercel.app/en',
  ],
  ['query credentials', '/en?token=SECRET'],
  ['fragment credentials', '/en#SECRET'],
  ['missing location', undefined],
  ['malformed URL', 'https://[invalid'],
  ['encoded slash API', '/%2fapi/private'],
  ['nested encoding', '/%2561pi/private'],
])
  test(`exported verifier refuses ${name} before a redirect transport request`, async (t) => {
    const f = await transportFixture(t, () => ({ status: 302, location }));
    await assert.rejects(f.run());
    assert.deepEqual(f.calls, ['/api/build-info', '/en']);
    assert.deepEqual(f.navigations, []);
    assert.deepEqual(f.fulfilled, []);
    assert.ok(!(await f.failure()).includes('SECRET'));
  });

for (const loop of [true, false])
  test(`exported verifier bounds ${loop ? 'redirect cycles' : 'unique redirect chains'}`, async (t) => {
    const f = await transportFixture(t, (path) => ({
      status: 308,
      location: loop
        ? '/en'
        : `/hop-${path === '/en' ? 1 : Number(path.slice(5)) + 1}`,
    }));
    await assert.rejects(f.run());
    assert.equal(f.calls.length, loop ? 2 : 7);
    assert.deepEqual(f.fulfilled, []);
  });

test('exported verifier preserves non-200 final navigation failure', async (t) => {
  const f = await transportFixture(t, (path) =>
    path === '/en' ? { status: 303, location: '/unavailable' } : { status: 503 }
  );
  await assert.rejects(
    f.run(),
    (error) =>
      error.stagedReason === 'Staged public page failed or left the candidate'
  );
  const failure = JSON.parse(await f.failure());
  assert.equal(failure.navigation.status, 503);
  assert.equal(failure.navigation.finalPath, '/unavailable');
  assert.deepEqual(f.calls, ['/api/build-info', '/en', '/unavailable']);
});

test('identity transport cannot follow redirects even to the candidate', async (t) => {
  const f = await transportFixture(t, () => undefined, {
    status: 301,
    location: '/en',
  });
  await assert.rejects(f.run());
  assert.deepEqual(f.calls, ['/api/build-info']);
  assert.deepEqual(f.navigations, []);
});

for (const foreign of [true, false])
  test(`browser resource redirects ${foreign ? 'cannot escape the candidate' : 'cannot flatten at a different base URL'}`, async (t) => {
    const f = await transportFixture(t, (path) =>
      path === '/_next/static/chunks/site.css'
        ? {
            status: 301,
            location: foreign
              ? 'https://elsewhere.example/site.css'
              : '/other/site.css',
          }
        : undefined
    );
    await assert.rejects(f.run());
    assert.ok(!f.calls.some((path) => path.includes('elsewhere')));
    assert.ok(!f.fulfilled.some((url) => url.endsWith('site.css')));
    assert.equal(
      f.calls.filter((path) => path === '/other/site.css').length,
      foreign ? 0 : 1
    );
    const failure = JSON.parse(await f.failure());
    assert.ok(
      failure.resourceFailures.includes(
        foreign
          ? 'Staged transport destination is not admitted'
          : 'Staged resource redirect changes its browser URL'
      )
    );
  });
