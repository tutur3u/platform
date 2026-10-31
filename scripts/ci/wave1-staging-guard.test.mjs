import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profiles } from './wave1-native-profile.mjs';
import {
  assertAdmissionSet,
  assertEnvironmentProtected,
  assertFenceOpen,
  assertStagingD1,
  assertStagingHost,
  assertStagingIdentity,
  assertStagingScript,
  main,
  preflight,
  preflightEnvironments,
  REQUIRED_ENVIRONMENTS,
  stagingAllowlist,
} from './wave1-staging-guard.mjs';

const d1 = '33333333-3333-3333-3333-333333333333';
const worker = 'tuturuuu-web-wave1-staging';

test('the reviewed allowlist is the web staging Worker and the tutur3u.com apex', () => {
  const allowed = stagingAllowlist();
  assert.deepEqual([...allowed.scripts], [worker]);
  assert.deepEqual([...allowed.hosts], ['tutur3u.com']);
  assert.equal(profiles.webStaging.stagingWorker, worker);
});

test('a malformed allowlist can never widen the guard', () => {
  for (const bad of [
    null,
    {},
    { scripts: [], hosts: ['tutur3u.com'] },
    { scripts: [worker], hosts: [] },
    { scripts: ['Bad_Name'], hosts: ['tutur3u.com'] },
    { scripts: [worker], hosts: ['tuturuuu.com'] },
    { scripts: [worker], hosts: ['web.tuturuuu.com'] },
    { scripts: [worker], hosts: ['*.tutur3u.com'] },
    { scripts: [worker], hosts: ['web.staging.tutur3u.com'] },
  ])
    assert.throws(() => stagingAllowlist(bad), /allowlist|Staging host/u);
});

test('an allowlisted Worker script is accepted', () => {
  assert.equal(assertStagingScript(worker), worker);
});
for (const script of [
  undefined,
  null,
  '',
  'tuturuuu-web',
  'tuturuuu-web-wave1-staging.',
  'Tuturuuu-Web-Wave1-Staging',
  'tuturuuu-web-wave1-staging-2',
  ' tuturuuu-web-wave1-staging',
  'tuturuuu-apps',
  'tuturuuu-web-start-candidate',
]) {
  test(`a non-allowlisted Worker script is refused: ${JSON.stringify(script)}`, () => {
    assert.throws(() => assertStagingScript(script), /allowlisted staging/u);
  });
}

test('the allowlisted apex host and an allowlisted subdomain are accepted', () => {
  assert.equal(assertStagingHost('tutur3u.com'), 'tutur3u.com');
  const allowlist = {
    scripts: [worker],
    hosts: ['tutur3u.com', 'web.tutur3u.com'],
  };
  assert.equal(
    assertStagingHost('web.tutur3u.com', allowlist),
    'web.tutur3u.com'
  );
});
for (const host of [
  'tuturuuu.com',
  'web.tuturuuu.com',
  'a.b.tuturuuu.com',
  'tutur3u.com.',
  'web.tutur3u.com.',
  'Tutur3u.com',
  'WEB.TUTUR3U.COM',
  'tutur3u.com.evil.example',
  'tutur3u.com.tuturuuu.com',
  'nottutur3u.com',
  'xtutur3u.com',
  'web-tutur3u.com',
  'web.tutur3u.co',
  'web.tutur3u.com:443',
  'tutur3u.com/',
  ' tutur3u.com',
  'web.staging.tutur3u.com',
  '*.tutur3u.com',
  '.tutur3u.com',
  // Matches the pattern but is not on the reviewed allowlist.
  'web.tutur3u.com',
  'calendar.tutur3u.com',
  '',
  undefined,
  null,
  42,
]) {
  test(`a non-allowlisted route host is refused: ${JSON.stringify(host)}`, () => {
    assert.throws(() => assertStagingHost(host));
  });
}

test('the D1 database must equal the configured WAVE1_STAGING_ATTEMPT_D1_ID', () => {
  assert.equal(assertStagingD1(d1, d1), d1);
  assert.throws(
    () => assertStagingD1('44444444-4444-4444-4444-444444444444', d1),
    /other than WAVE1_STAGING_ATTEMPT_D1_ID/u
  );
  for (const unset of [undefined, null, ''])
    assert.throws(() => assertStagingD1(d1, unset), /not configured/u);
  for (const id of [undefined, null, '', `${d1} `, `${d1}0`])
    assert.throws(() => assertStagingD1(id, d1), /other than/u);
});

test('a staging identity names an allowlisted Worker, host and the one D1', () => {
  const env = { WAVE1_STAGING_ATTEMPT_D1_ID: d1 };
  assert.doesNotThrow(() =>
    assertStagingIdentity({
      worker,
      hosts: ['tutur3u.com'],
      databaseId: d1,
      env,
    })
  );
  assert.throws(() =>
    assertStagingIdentity({ worker: 'other', hosts: [], databaseId: d1, env })
  );
  assert.throws(() =>
    assertStagingIdentity({
      worker,
      hosts: ['web.tuturuuu.com'],
      databaseId: d1,
      env,
    })
  );
  assert.throws(() =>
    assertStagingIdentity({ worker, hosts: [], databaseId: 'other', env })
  );
  assert.throws(() =>
    assertStagingIdentity({ worker, hosts: [], databaseId: d1, env: {} })
  );
});

test('only an exact true opens the fence and an unset admission is refused', () => {
  assert.doesNotThrow(() => assertFenceOpen('true'));
  for (const value of [
    undefined,
    null,
    '',
    'false',
    'TRUE',
    'True',
    ' true',
    '1',
  ])
    assert.throws(() => assertFenceOpen(value), /not enabled/u);
  assert.doesNotThrow(() => assertAdmissionSet('{"schema":1}'));
  for (const value of [undefined, null, '', '   '])
    assert.throws(() => assertAdmissionSet(value), /not set/u);
});

const protectedEnvironment = (name) => ({
  name,
  protection_rules: [
    { type: 'wait_timer', wait_timer: 0 },
    {
      type: 'required_reviewers',
      prevent_self_review: true,
      reviewers: [{ type: 'User', reviewer: {} }],
    },
    { type: 'branch_policy' },
  ],
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true,
  },
});
const mainOnly = { branch_policies: [{ name: 'main', type: 'branch' }] };

// Serves each named environment from `world`; counts every request.
function github(world = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.match(options.headers.authorization, /^Bearer /u);
    const { pathname } = new URL(url);
    const match = pathname.match(
      /^\/repos\/fixture\/repo\/environments\/([a-z0-9-]+)(\/deployment-branch-policies)?$/u
    );
    const entry = match && world[match[1]];
    if (!entry) return new Response('{}', { status: 404 });
    if (entry.status) return new Response('{}', { status: entry.status });
    return Response.json(match[2] ? entry.policies : entry.environment);
  };
  return { calls, fetcher };
}
const healthyWorld = () =>
  Object.fromEntries(
    REQUIRED_ENVIRONMENTS.map((name) => [
      name,
      { environment: protectedEnvironment(name), policies: mainOnly },
    ])
  );
const run = (world, environments) =>
  preflightEnvironments({
    repository: 'fixture/repo',
    token: 'gh',
    environments,
    fetcher: github(world).fetcher,
  });

test('the one required environment is protected on the happy path', async () => {
  assert.deepEqual([...REQUIRED_ENVIRONMENTS], ['wave1-web-staging']);
  assert.deepEqual(await run(healthyWorld()), ['wave1-web-staging']);
});

for (const name of REQUIRED_ENVIRONMENTS)
  test(`a missing environment stops the run: ${name}`, async () => {
    const world = healthyWorld();
    delete world[name];
    await assert.rejects(run(world), /could not be verified/u);
  });

const unprotected = [
  [
    'no required-reviewers rule',
    (e) => {
      e.environment.protection_rules = [{ type: 'wait_timer' }];
    },
    /no required reviewers/u,
  ],
  [
    'an empty reviewer list',
    (e) => {
      e.environment.protection_rules = [
        { type: 'required_reviewers', reviewers: [] },
      ];
    },
    /no required reviewers/u,
  ],
  [
    'no protection rules at all',
    (e) => {
      delete e.environment.protection_rules;
    },
    /no required reviewers/u,
  ],
  [
    'self-review is allowed (prevent_self_review false)',
    (e) => {
      e.environment.protection_rules = [
        {
          type: 'required_reviewers',
          prevent_self_review: false,
          reviewers: [{ type: 'User', reviewer: {} }],
        },
      ];
    },
    /does not prevent self-review/u,
  ],
  [
    'self-review prevention is missing',
    (e) => {
      e.environment.protection_rules = [
        { type: 'required_reviewers', reviewers: [{ type: 'Team' }] },
      ];
    },
    /does not prevent self-review/u,
  ],
  [
    'self-review prevention is not exactly true',
    (e) => {
      e.environment.protection_rules = [
        {
          type: 'required_reviewers',
          prevent_self_review: 'true',
          reviewers: [{ type: 'User' }],
        },
      ];
    },
    /does not prevent self-review/u,
  ],
  [
    'a reviewer entry that is neither a user nor a team',
    (e) => {
      e.environment.protection_rules = [
        {
          type: 'required_reviewers',
          prevent_self_review: true,
          reviewers: [{ type: 'Bot' }, null],
        },
      ];
    },
    /no required reviewers/u,
  ],
  [
    'any branch may deploy (no policy)',
    (e) => {
      e.environment.deployment_branch_policy = null;
    },
    /custom branch policy/u,
  ],
  [
    'protected branches instead of main only',
    (e) => {
      e.environment.deployment_branch_policy = {
        protected_branches: true,
        custom_branch_policies: false,
      };
    },
    /custom branch policy/u,
  ],
  [
    'a branch policy other than main',
    (e) => {
      e.policies = { branch_policies: [{ name: 'release', type: 'branch' }] };
    },
    /main branch only/u,
  ],
  [
    'main plus a second branch',
    (e) => {
      e.policies = {
        branch_policies: [
          { name: 'main', type: 'branch' },
          { name: 'lane/*', type: 'branch' },
        ],
      };
    },
    /main branch only/u,
  ],
  [
    'a wildcard that matches main',
    (e) => {
      e.policies = { branch_policies: [{ name: '*', type: 'branch' }] };
    },
    /main branch only/u,
  ],
  [
    'a tag policy named main',
    (e) => {
      e.policies = { branch_policies: [{ name: 'main', type: 'tag' }] };
    },
    /main branch only/u,
  ],
  [
    'no branch policies',
    (e) => {
      e.policies = { branch_policies: [] };
    },
    /main branch only/u,
  ],
  [
    'the API refuses the read',
    (e) => {
      e.status = 403;
    },
    /could not be verified/u,
  ],
];
for (const name of REQUIRED_ENVIRONMENTS)
  for (const [label, mutate, message] of unprotected)
    test(`an unprotected ${name} stops the run: ${label}`, async () => {
      const world = healthyWorld();
      mutate(world[name]);
      await assert.rejects(run(world), message);
    });

test('an environment answered under another name is not accepted', async () => {
  const world = healthyWorld();
  world['wave1-web-staging'].environment.name = 'someone-else';
  await assert.rejects(run(world), /is missing/u);
});

test('the protection assertion is pure and needs reviewers, no self-review and main only', () => {
  assert.doesNotThrow(() =>
    assertEnvironmentProtected('e', protectedEnvironment('e'), mainOnly)
  );
  assert.throws(() => assertEnvironmentProtected('e', undefined, mainOnly));
  const selfReview = protectedEnvironment('e');
  selfReview.protection_rules[1].prevent_self_review = false;
  assert.throws(
    () => assertEnvironmentProtected('e', selfReview, mainOnly),
    /does not prevent self-review/u
  );
  const noReviewers = protectedEnvironment('e');
  noReviewers.protection_rules[1].reviewers = [];
  assert.throws(
    () => assertEnvironmentProtected('e', noReviewers, mainOnly),
    /no required reviewers/u
  );
});

for (const status of [403, 404])
  test(`a ${status} on the environments API fails closed and names the read-only token`, async () => {
    const world = healthyWorld();
    world['wave1-web-staging'].status = status;
    await assert.rejects(
      preflight({ env: baseEnv(), fetcher: github(world).fetcher }),
      (error) => {
        assert.match(error.message, new RegExp(`answered ${status}`, 'u'));
        assert.match(error.message, /read-only WAVE1_ENV_READ_TOKEN/u);
        assert.doesNotMatch(error.message, /write/iu);
        return true;
      }
    );
  });

test('a non-permission API failure fails closed without the token hint', async () => {
  const world = healthyWorld();
  world['wave1-web-staging'].status = 500;
  await assert.rejects(
    run(world),
    (error) =>
      /answered 500/u.test(error.message) &&
      !/WAVE1_ENV_READ_TOKEN/u.test(error.message)
  );
});

const baseEnv = () => ({
  WAVE1_STAGING_PUBLISH_ENABLED: 'true',
  WAVE1_STAGING_ATTEMPT_D1_ID: d1,
  CLOUDFLARE_STAGING_ACCOUNT_ID: profiles.accountId,
  GITHUB_REPOSITORY: 'fixture/repo',
  GH_TOKEN: 'gh',
});

test('preflight passes only with the fence, identifiers and protected environments', async () => {
  const gh = github(healthyWorld());
  assert.deepEqual(await preflight({ env: baseEnv(), fetcher: gh.fetcher }), [
    ...REQUIRED_ENVIRONMENTS,
  ]);
  assert.ok(gh.calls.length >= REQUIRED_ENVIRONMENTS.length);
});

for (const [label, patch] of [
  ['an unset fence', { WAVE1_STAGING_PUBLISH_ENABLED: undefined }],
  ['a false fence', { WAVE1_STAGING_PUBLISH_ENABLED: 'false' }],
  ['an empty fence', { WAVE1_STAGING_PUBLISH_ENABLED: '' }],
  ['an unset D1 id', { WAVE1_STAGING_ATTEMPT_D1_ID: undefined }],
  ['an unset account id', { CLOUDFLARE_STAGING_ACCOUNT_ID: undefined }],
  ['another account id', { CLOUDFLARE_STAGING_ACCOUNT_ID: 'other-account' }],
])
  test(`preflight stops before any GitHub or Cloudflare request on ${label}`, async () => {
    const gh = github(healthyWorld());
    await assert.rejects(
      preflight({ env: { ...baseEnv(), ...patch }, fetcher: gh.fetcher })
    );
    assert.deepEqual(gh.calls, []);
  });

test('an unprotected environment stops preflight and never reaches a credential', async () => {
  const world = healthyWorld();
  world['wave1-web-staging'].environment.protection_rules = [];
  const gh = github(world);
  await assert.rejects(
    preflight({ env: baseEnv(), fetcher: gh.fetcher }),
    /no required reviewers/u
  );
  assert.ok(
    gh.calls.every((url) => url.startsWith('https://api.github.com/')),
    'only the credential-free GitHub read ran'
  );
});

test('the admission mode refuses an unset fence or admission', async () => {
  const env = {
    WAVE1_STAGING_PUBLISH_ENABLED: 'true',
    WAVE1_STAGING_PUBLICATION_ADMISSION: '{"schema":1}',
  };
  await assert.doesNotReject(main(['admission'], env));
  await assert.rejects(
    main(['admission'], { ...env, WAVE1_STAGING_PUBLISH_ENABLED: undefined }),
    /not enabled/u
  );
  await assert.rejects(
    main(['admission'], {
      ...env,
      WAVE1_STAGING_PUBLICATION_ADMISSION: undefined,
    }),
    /not set/u
  );
  await assert.rejects(main(['bogus'], env), /Unknown mode/u);
});
