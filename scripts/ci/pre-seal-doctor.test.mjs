import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CONFIG,
  judgeBuildInfo,
  judgeRoot,
  parseArgs,
} from './pre-seal-doctor.mjs';

const SHA = 'a'.repeat(40);
const HOST = 'nova.tuturuuu.com';
const ok = ['nova', 'apps/nova', HOST, SHA];

test('parseArgs reads the four positionals and defaults', () => {
  assert.deepEqual(parseArgs(ok), {
    app: 'nova',
    artifactDir: 'apps/nova',
    host: HOST,
    sha: SHA,
    expectRedirect: false,
    config: DEFAULT_CONFIG,
  });
});

test('parseArgs accepts --expect-redirect and --config in any position', () => {
  const parsed = parseArgs([
    '--expect-redirect',
    ...ok,
    '--config',
    'dist/wave1/wrangler.json',
  ]);
  assert.equal(parsed.expectRedirect, true);
  assert.equal(parsed.config, 'dist/wave1/wrangler.json');
});

test('parseArgs rejects malformed input', () => {
  assert.throws(() => parseArgs(ok.slice(0, 3)), /4 positional/u);
  assert.throws(() => parseArgs([...ok, 'extra']), /4 positional/u);
  assert.throws(() => parseArgs([...ok, '--bogus']), /Unknown option/u);
  assert.throws(() => parseArgs([...ok, '--config']), /needs a path/u);
  assert.throws(
    () => parseArgs([...ok, '--config', '../escape.json']),
    /inside the artifact/u
  );
  assert.throws(
    () => parseArgs(['nova', 'apps/nova', 'https://nova.tuturuuu.com', SHA]),
    /bare hostname/u
  );
  assert.throws(
    () => parseArgs(['nova', 'apps/nova', HOST, 'abc123']),
    /40 lowercase hex/u
  );
});

test('judgeRoot passes a 200 and fails 404, 503, 401 and 5xx naming the status and host', () => {
  const options = { host: HOST, expectRedirect: false };
  assert.deepEqual(judgeRoot({ status: 200 }, options), []);
  for (const status of [401, 404, 500, 503]) {
    const [problem] = judgeRoot({ status }, options);
    assert.match(problem, new RegExp(String(status), 'u'));
    assert.match(problem, new RegExp(HOST.replaceAll('.', '\\.'), 'u'));
  }
  assert.match(
    judgeRoot({ status: 404 }, options)[0],
    /not served by any mount/u
  );
});

test('judgeRoot accepts only an auth redirect and only when expected', () => {
  const expecting = { host: HOST, expectRedirect: true };
  const redirect = (location) => ({ status: 307, location });
  assert.deepEqual(judgeRoot({ status: 200 }, expecting), []);
  assert.deepEqual(
    judgeRoot(redirect(`http://${HOST}/verify-token?nextUrl=%2F`), expecting),
    []
  );
  assert.deepEqual(
    judgeRoot(redirect('https://tuturuuu.com/login?returnUrl=x'), expecting),
    []
  );
  assert.match(
    judgeRoot(redirect('https://evil.example/home'), expecting)[0],
    /not an auth path/u
  );
  assert.match(judgeRoot(redirect(null), expecting)[0], /not an auth path/u);
  assert.match(
    judgeRoot(redirect('https://evil.example/login'), expecting)[0],
    /neither nova\.tuturuuu\.com nor the web login host/u
  );
  assert.deepEqual(judgeRoot(redirect('/login?x=1'), expecting), []);
  assert.match(
    judgeRoot(redirect('/login'), { host: HOST, expectRedirect: false })[0],
    /--expect-redirect/u
  );
  assert.match(
    judgeRoot({ status: 503 }, expecting)[0],
    /or an auth redirect/u
  );
});

test('judgeBuildInfo requires 200 JSON whose commitHash equals the expected sha', () => {
  const options = { host: HOST, sha: SHA };
  const body = (value) => JSON.stringify(value);
  assert.deepEqual(
    judgeBuildInfo({ status: 200, body: body({ commitHash: SHA }) }, options),
    []
  );
  assert.match(
    judgeBuildInfo({ status: 401, body: '' }, options)[0],
    /401 \(the proxy rejects the anonymous build identity\)/u
  );
  assert.match(judgeBuildInfo({ status: 404, body: '' }, options)[0], /404/u);
  assert.match(judgeBuildInfo({ status: 503, body: '' }, options)[0], /503/u);
  assert.match(
    judgeBuildInfo({ status: 200, body: 'nope' }, options)[0],
    /not JSON/u
  );
  assert.match(
    judgeBuildInfo({ status: 200, body: body({}) }, options)[0],
    /without a commitHash/u
  );
  assert.match(
    judgeBuildInfo(
      { status: 200, body: body({ commitHash: 'local' }) },
      options
    )[0],
    /reports commitHash local/u
  );
});
