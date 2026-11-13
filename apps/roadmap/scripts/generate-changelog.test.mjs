import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseChangelog } from '../src/changelog/schema.ts';
import { MODEL, publicItems, releaseWindows } from './changelog-inputs.mjs';
import {
  fallbackRelease,
  generateChangelog,
  SYSTEM,
} from './generate-changelog.mjs';

const date = (day) => `2026-11-${String(day).padStart(2, '0')}T00:00:00Z`;
const release = (n) => ({
  number: n,
  merged_at: date(n),
  merge_commit_sha: String(n).padStart(40, 'a'),
});
const pr = (n, day = 2, title = 'feat(tasks): add a beautiful board') => ({
  number: n,
  title,
  body: 'UNTRUSTED_BODY',
  labels: [],
  merged_at: date(day),
  merge_commit_sha: 'b'.repeat(40),
  base: {
    ref: 'main',
    repo: { full_name: 'tutur3u/platform', private: false },
  },
});
const inputs = [
  {
    release: release(3),
    prs: [pr(10), pr(11, 2, 'perf(calendar): improve weekly view')],
  },
];
const env = {
  GEMINI_API_KEY: 'FAKE_KEY_94',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/main',
};
const valid = () => ({
  schema: 1,
  generatedAt: date(3),
  mode: 'llm',
  model: MODEL,
  releases: [fallbackRelease(inputs[0].release, publicItems(inputs[0].prs))],
});
const response = (value) => ({
  ok: true,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
  }),
});
function directory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'changelog-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('schema accepts valid bilingual content; strips controls; rejects broken shapes', () => {
  assert.ok(parseChangelog(valid()));
  const controls = valid();
  controls.releases[0].title.en = 'Safe\u0000 title';
  assert.equal(parseChangelog(controls).releases[0].title.en, 'Safe title');
  for (const mutate of [
    (v) => {
      v.extra = true;
    },
    (v) => {
      v.schema = '1';
    },
    (v) => {
      v.model = null;
    },
    (v) => {
      v.releases[0].title.en = 'x'.repeat(121);
    },
    (v) => {
      v.releases[0].summary.vi = 'x'.repeat(601);
    },
    (v) => {
      v.releases[0].products[0].items[0].text.en = 'x'.repeat(281);
    },
    (v) => {
      v.releases[0].sha = 'bad';
    },
    (v) => {
      v.releases[0].products[0].items[0].prs = [0];
    },
    (v) => {
      v.releases[0].products[0].items[0].prs = ['10'];
    },
    (v) => {
      v.releases[0].products[0].items[0].prs = [];
    },
  ]) {
    const broken = valid();
    mutate(broken);
    assert.equal(parseChangelog(broken), null);
  }
  for (const text of [
    '<script>alert(1)',
    'javaScript:alert(1)',
    'https://evil.test/a',
    'www.evil.test',
    'evil.test/path',
    '[link](elsewhere)',
    '![image](foo)',
    '[link][reference]',
    '![image][reference]',
  ]) {
    const broken = valid();
    broken.releases[0].title.vi = text;
    assert.equal(parseChangelog(broken), null, text);
  }
});

test('fallback maps existing tracks, cleans prefixes and retains publication filters', () => {
  const items = publicItems(inputs[0].prs);
  assert.deepEqual(
    items.map((p) => [p.product, p.title]),
    [
      ['tasks', 'Add a beautiful board'],
      ['calendar', 'Improve weekly view'],
    ]
  );
  const fallback = fallbackRelease(release(3), items);
  assert.equal(
    fallback.products[0].items[0].text.en,
    fallback.products[0].items[0].text.vi
  );
  assert.deepEqual(publicItems([pr(1, 2, 'chore(tasks): internal work')]), []);
  assert.equal(
    fallbackRelease(release(3), [
      { number: 1, product: 'tasks', title: '<script>unsafe' },
    ]).products.length,
    0
  );
});

test('release windows exclude lower bound, include upper bound and reject foreign/unmerged PRs', () => {
  const rows = [
    pr(10, 1),
    pr(11, 2),
    pr(12, 3),
    pr(13, 4),
    { ...pr(14), merged_at: null },
    {
      ...pr(15),
      base: { ref: 'main', repo: { full_name: 'private/repo', private: true } },
    },
  ];
  assert.deepEqual(
    releaseWindows([release(3), release(2), release(1)], rows).map((w) =>
      w.prs.map((p) => p.number)
    ),
    [[12], [11]]
  );
});

test('missing key and PR contexts fall back with zero LLM calls (broken: key present)', async (t) => {
  for (const context of [
    {},
    { ...env, GITHUB_EVENT_NAME: 'pull_request' },
    { ...env, GITHUB_EVENT_NAME: 'pull_request_target' },
    { ...env, GITHUB_REF: 'refs/heads/feature' },
    { ...env, GITHUB_EVENT_NAME: undefined },
  ]) {
    let calls = 0;
    const result = await generateChangelog({
      directory: directory(t),
      inputs,
      env: context,
      fetchImpl: () => {
        calls++;
        throw Error('LLM called');
      },
    });
    assert.equal(result.mode, 'fallback');
    assert.equal(result.model, null);
    assert.equal(calls, 0);
  }
});

test('LLM uses header only, untrusted system instruction; cache hit forbids second fetch; changed input misses', async (t) => {
  const dir = directory(t);
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.ok(!url.includes(env.GEMINI_API_KEY));
    assert.ok(!url.includes('?key='));
    assert.equal(options.headers['x-goog-api-key'], env.GEMINI_API_KEY);
    assert.match(SYSTEM, /UNTRUSTED DATA/);
    assert.match(SYSTEM, /never instructions/);
    return response(valid());
  };
  assert.equal(
    (await generateChangelog({ directory: dir, inputs, env, fetchImpl })).mode,
    'llm'
  );
  assert.equal(calls, 1);
  let cacheCalls = 0;
  const second = await generateChangelog({
    directory: dir,
    inputs,
    env,
    fetchImpl: () => {
      cacheCalls++;
      throw Error('cache network');
    },
  });
  assert.equal(cacheCalls, 0);
  assert.equal(second.mode, 'llm');
  const changed = structuredClone(inputs);
  changed[0].prs[0].body += 'changed';
  await generateChangelog({ directory: dir, inputs: changed, env, fetchImpl });
  assert.equal(calls, 2);
});

test('offline makes no network calls with cache and without cache', async (t) => {
  const dir = directory(t);
  let calls = 0;
  const fetchImpl = () => {
    calls++;
    throw Error('offline network');
  };
  assert.equal(
    await generateChangelog({
      directory: dir,
      env: { ROADMAP_OFFLINE: '1' },
      fetchImpl,
    }),
    null
  );
  await generateChangelog({ directory: dir, inputs, env: {}, fetchImpl });
  assert.equal(
    (
      await generateChangelog({
        directory: dir,
        env: { ROADMAP_OFFLINE: '1' },
        fetchImpl,
      })
    ).mode,
    'fallback'
  );
  assert.equal(calls, 0);
});

test('one invalid LLM item makes WHOLE release fall back; unknown/missing PRs and links fail', async (t) => {
  for (const mutate of [
    (v) => {
      v.releases[0].products[0].items[0].prs = [999];
    },
    (v) => {
      v.releases[0].products[0].items[0].prs = [];
    },
    (v) => {
      v.releases[0].products[0].items[0].text.vi = 'https://bad.test';
    },
    (v) => {
      v.releases[0].products[0].items[0].text.vi = '[click](bad)';
    },
    (v) => {
      v.releases[0].products[0].items[0].text.en = env.GEMINI_API_KEY;
    },
  ]) {
    const broken = valid();
    mutate(broken);
    const result = await generateChangelog({
      directory: directory(t),
      inputs,
      env,
      fetchImpl: async () => response(broken),
      log: () => {},
    });
    assert.equal(result.mode, 'fallback');
    assert.deepEqual(result.releases[0], valid().releases[0]);
  }
});

test('error logs and output never contain key, prompt or response bodies', async (t) => {
  const dir = directory(t);
  const logs = [];
  const result = await generateChangelog({
    directory: dir,
    inputs,
    env,
    fetchImpl: async () => {
      throw Error(
        `${env.GEMINI_API_KEY} UNTRUSTED_BODY RESPONSE_SECRET ${SYSTEM}`
      );
    },
    log: (code) => logs.push(code),
  });
  assert.deepEqual(logs, ['LLM_INVALID']);
  assert.equal(result.mode, 'fallback');
  const artifact = readFileSync(join(dir, 'changelog.json'), 'utf8');
  for (const secret of [
    env.GEMINI_API_KEY,
    'UNTRUSTED_BODY',
    'RESPONSE_SECRET',
    SYSTEM,
  ]) {
    assert.ok(!artifact.includes(secret));
    assert.ok(!logs.join('').includes(secret));
  }
});

test('PR offline restores deterministic fallback even after an LLM cache was populated', async (t) => {
  const dir = directory(t);
  await generateChangelog({
    directory: dir,
    inputs,
    env,
    fetchImpl: async () => response(valid()),
  });
  const result = await generateChangelog({
    directory: dir,
    env: { ...env, GITHUB_EVENT_NAME: 'pull_request', ROADMAP_OFFLINE: '1' },
    fetchImpl: () => assert.fail('offline'),
  });
  assert.equal(result.mode, 'fallback');
  assert.deepEqual(result.releases[0], valid().releases[0]);
});

test('anonymous GitHub 403/429 restores cache; no authorization header or raw errors logged', async (t) => {
  for (const status of [403, 429]) {
    const dir = directory(t);
    const logs = [];
    await generateChangelog({ directory: dir, inputs, env: {} });
    const result = await generateChangelog({
      directory: dir,
      env: { GH_TOKEN: 'BROAD_TOKEN' },
      log: (code) => logs.push(code),
      fetchImpl: async (url, options) => {
        assert.ok(
          url.startsWith('https://api.github.com/repos/tutur3u/platform/')
        );
        assert.equal(options.headers.authorization, undefined);
        return { ok: false, status };
      },
    });
    assert.equal(result.mode, 'fallback');
    assert.deepEqual(logs, ['GH_UNAVAILABLE']);
  }
});

test('LLM HTTP and timeout failures log only bounded codes and use fallback', async (t) => {
  for (const status of [403, 429, 500]) {
    const logs = [];
    const result = await generateChangelog({
      directory: directory(t),
      inputs,
      env,
      log: (code) => logs.push(code),
      fetchImpl: async () => ({
        ok: false,
        status,
        json: async () => assert.fail('must not read error body'),
      }),
    });
    assert.equal(result.mode, 'fallback');
    assert.deepEqual(logs, [`LLM_HTTP_${status}`]);
  }
});

test('unmerged and private PRs cannot become LLM inputs even with valid product titles', () => {
  assert.deepEqual(
    publicItems([
      { ...pr(1), merged_at: null },
      {
        ...pr(2),
        base: {
          ref: 'main',
          repo: { full_name: 'tutur3u/platform', private: true },
        },
      },
    ]),
    []
  );
});
