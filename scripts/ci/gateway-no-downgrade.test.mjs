import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decide,
  evaluate,
  githubCompare,
  servingCommit,
} from './gateway-no-downgrade.mjs';

const target = 'a'.repeat(40);
const other = 'b'.repeat(40);
const settings = (message) => ({ success: true, result: { message } });

test('parses the gateway build commit like the production verifier', () => {
  assert.equal(servingCommit(`gateway ${other} families=x`), other);
  assert.equal(servingCommit(other), other);
  for (const message of [
    null,
    undefined,
    '',
    'gateway',
    `gateway ${other.slice(0, 12)}`,
    `deploy ${other}`,
    `gateway ${other}x`,
  ])
    assert.equal(servingCommit(message), null, String(message));
});

test('decides from how the serving commit relates to the target', () => {
  const at = (status) => decide({ serving: other, target, status });
  assert.deepEqual(decide({ serving: target, target, status: null }), {
    deploy: false,
    reason: 'same',
  });
  assert.deepEqual(at('identical'), { deploy: false, reason: 'same' });
  assert.deepEqual(at('ahead'), { deploy: false, reason: 'live-ahead' });
  assert.deepEqual(at('behind'), { deploy: true, reason: 'live-behind' });
  assert.deepEqual(at('diverged'), { deploy: false, reason: 'diverged' });
  assert.deepEqual(at(null), { deploy: false, reason: 'unknown-commit' });
  assert.deepEqual(at('weird'), { deploy: false, reason: 'unknown-commit' });
});

test('an unparseable message fails closed unless forced', () => {
  assert.deepEqual(decide({ serving: null, target, status: null }), {
    deploy: false,
    reason: 'unparseable',
  });
  assert.deepEqual(
    decide({ serving: null, target, status: null, force: true }),
    { deploy: true, reason: 'unparseable-forced' }
  );
  // Force only overrides the unparseable case, never a newer live gateway.
  assert.deepEqual(
    decide({ serving: other, target, status: 'ahead', force: true }),
    { deploy: false, reason: 'live-ahead' }
  );
});

test('evaluate compares target...serving and skips the call when equal', async () => {
  const calls = [];
  const compare = (status) => async (args) => {
    calls.push(args);
    return status;
  };
  const run = (message, status, force = false) =>
    evaluate({
      settings: settings(message),
      target,
      repo: 'o/r',
      token: 't',
      force,
      compare: compare(status),
    });

  assert.deepEqual(await run(`gateway ${target} families=none`, 'behind'), {
    serving: target,
    deploy: false,
    reason: 'same',
  });
  assert.equal(calls.length, 0);

  assert.equal((await run(`gateway ${other}`, 'ahead')).reason, 'live-ahead');
  assert.deepEqual(calls.at(-1), {
    repo: 'o/r',
    base: target,
    head: other,
    token: 't',
  });
  assert.equal((await run(`gateway ${other}`, 'behind')).deploy, true);
  assert.equal((await run(`gateway ${other}`, 'diverged')).reason, 'diverged');
  // compare() returns null for a commit GitHub does not know (404).
  assert.equal((await run(`gateway ${other}`, null)).reason, 'unknown-commit');
  const before = calls.length;
  assert.equal((await run('manual deploy', 'behind')).reason, 'unparseable');
  assert.equal((await run(undefined, 'behind', true)).deploy, true);
  assert.equal(calls.length, before);

  await assert.rejects(
    evaluate({ settings: settings(other), target: 'HEAD', compare }),
    /TARGET_SHA/
  );
});

test('githubCompare sends only validated SHAs and the repository slug', async () => {
  const base = 'a'.repeat(40);
  const head = 'b'.repeat(40);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ status: 'behind' }), { status: 200 });
  };
  assert.equal(
    await githubCompare({
      repo: 'tutur3u/platform',
      base,
      head,
      token: 't',
      fetchImpl,
    }),
    'behind'
  );
  assert.equal(
    calls[0].url,
    `https://api.github.com/repos/tutur3u/platform/compare/${base}...${head}?per_page=1`
  );
  assert.equal(calls[0].init.redirect, 'error');
  for (const bad of [
    { repo: 'tutur3u/platform/../x', base, head },
    { repo: 'tutur3u', base, head },
    { repo: 'tutur3u/platform', base: 'main', head },
    { repo: 'tutur3u/platform', base, head: `${head}?x=1` },
  ])
    await assert.rejects(githubCompare({ ...bad, fetchImpl }));
  assert.equal(calls.length, 1);
  const missing = async () => new Response('{}', { status: 404 });
  assert.equal(
    await githubCompare({
      repo: 'tutur3u/platform',
      base,
      head,
      fetchImpl: missing,
    }),
    null
  );
  const failing = async () => new Response('{}', { status: 500 });
  await assert.rejects(
    githubCompare({ repo: 'tutur3u/platform', base, head, fetchImpl: failing }),
    /HTTP 500/
  );
});
