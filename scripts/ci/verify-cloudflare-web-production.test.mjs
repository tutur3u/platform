import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyCloudflareWeb } from './verify-cloudflare-web-production.mjs';

const target = 'a'.repeat(40);
const ancestor = 'b'.repeat(40);
const descendant = 'c'.repeat(40);
const family = 'tuturuuu-web-vinext-api-core';
const gateway = 'tuturuuu-gateway';
const familyVersion = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const gatewayVersion = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const compare = (base, head) => `/compare/${base}...${head}?per_page=1`;

function world({
  served = target,
  familyStamp = served.slice(0, 12),
  message = `vinext api-core ${served}`,
  split = false,
  routed = family,
  advance = false,
  comparisons = {},
} = {}) {
  const events = [];
  let familyReads = 0;
  const replies = new Map([
    [
      `/${family}/versions/${familyVersion}`,
      {
        id: familyVersion,
        annotations: { 'workers/message': message },
        resources: {
          bindings: [
            {
              name: 'PLATFORM_DEPLOYMENT_STAMP',
              type: 'plain_text',
              text: familyStamp,
            },
          ],
        },
      },
    ],
    [
      `/${gateway}/versions/${gatewayVersion}`,
      {
        id: gatewayVersion,
        annotations: {
          'workers/message': `gateway ${target} families=api-core,public-docs`,
        },
        resources: {
          bindings: [
            { name: 'WEB_FAMILY_API_CORE', type: 'service', service: routed },
            {
              name: 'GATEWAY_WEB_FAMILIES',
              type: 'plain_text',
              text: 'api-core,public-docs',
            },
          ],
        },
      },
    ],
    [`/commits/${served}`, { sha: served }],
    [`/commits/${served.slice(0, 12)}`, { sha: served }],
    ...Object.entries(comparisons),
  ]);
  const options = {
    env: {
      TARGET_SHA: target,
      GITHUB_REPOSITORY: 'test/platform',
      GH_TOKEN: 'fixture-github',
      CLOUDFLARE_API_TOKEN: 'fixture-cloudflare',
      CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32),
      WEB_SERVING_WAIT_SECONDS: '0',
    },
    families: {
      families: [
        { id: 'api-core', worker: family, enabled: true, activated: true },
        {
          id: 'held',
          worker: 'tuturuuu-web-vinext-held',
          enabled: true,
          activated: false,
        },
      ],
    },
    request(input, init) {
      const url = new URL(input);
      const cf = url.hostname === 'api.cloudflare.com';
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'error');
      assert.equal(
        init.headers.Authorization,
        cf ? 'Bearer fixture-cloudflare' : 'Bearer fixture-github'
      );
      const path =
        url.pathname.replace(
          /^.*(?:\/workers\/scripts|\/repos\/test\/platform)/,
          ''
        ) + url.search;
      events.push(path);
      if (path.endsWith('/deployments')) {
        const isFamily = path === `/${family}/deployments`;
        const changed = isFamily && ++familyReads === 2 && advance;
        const version = isFamily && !changed ? familyVersion : gatewayVersion;
        return Promise.resolve(
          Response.json({
            success: true,
            result: {
              deployments: [
                {
                  created_on: '2026-11-21T00:00:00Z',
                  versions:
                    isFamily && split
                      ? [
                          { version_id: familyVersion, percentage: 90 },
                          { version_id: gatewayVersion, percentage: 10 },
                        ]
                      : [{ version_id: version, percentage: 100 }],
                },
              ],
            },
          })
        );
      }
      assert.ok(replies.has(path), path);
      const response = replies.get(path);
      return Promise.resolve(
        Response.json(cf ? { success: true, result: response } : response)
      );
    },
  };
  return { options, events };
}

for (const [name, scenario, expected] of [
  ['exact revision', {}, 'identical'],
  [
    'prefix on an existing version',
    { message: `vinext api-core ${target.slice(0, 12)}` },
    'identical',
  ],
  [
    'descendant on main',
    {
      served: descendant,
      comparisons: {
        [compare(target, descendant)]: { status: 'ahead' },
        [compare('refs/heads/main', descendant)]: { status: 'behind' },
      },
    },
    'ahead',
  ],
  [
    'ancestor with no build changes',
    {
      served: ancestor,
      comparisons: {
        [compare(target, ancestor)]: { status: 'behind' },
        [compare(ancestor, target)]: {
          status: 'ahead',
          files: [{ filename: 'apps/docs/notes.mdx' }],
        },
      },
    },
    'behind-unchanged',
  ],
]) {
  test(`records authenticated proof for ${name}`, async () => {
    const { options, events } = world(scenario);
    const proof = await verifyCloudflareWeb(options);
    assert.deepEqual(
      proof.results.map(({ worker, relation }) => [worker, relation]),
      [
        [family, expected],
        [gateway, 'identical'],
      ]
    );
    assert.equal(
      events.filter((path) => path.endsWith('/deployments')).length,
      4
    );
  });
}

for (const [name, scenario, reason] of [
  ['split traffic', { split: true }, 'worker-split-or-empty-deployment'],
  ['moving deployment', { advance: true }, 'worker-deployment-changed'],
  [
    'gateway with different service binding',
    { routed: 'different-worker' },
    'gateway-family-binding',
  ],
  [
    'version message does not match build stamp',
    { familyStamp: ancestor.slice(0, 12) },
    'family-version-commit-mismatch',
  ],
  [
    'descendant outside main',
    {
      served: descendant,
      comparisons: {
        [compare(target, descendant)]: { status: 'ahead' },
        [compare('refs/heads/main', descendant)]: { status: 'diverged' },
      },
    },
    'ahead-off-main',
  ],
  [
    'diverged build commit',
    {
      served: ancestor,
      comparisons: {
        [compare(target, ancestor)]: { status: 'diverged' },
      },
    },
    'diverged',
  ],
  [
    'ancestor predates a renamed build input',
    {
      served: ancestor,
      comparisons: {
        [compare(target, ancestor)]: { status: 'behind' },
        [compare(ancestor, target)]: {
          status: 'ahead',
          files: [
            {
              filename: 'archive/file.ts',
              previous_filename: 'packages/ui/file.ts',
            },
          ],
        },
      },
    },
    'behind-stale',
  ],
  [
    'ancestor predates the build metadata generator',
    {
      served: ancestor,
      comparisons: {
        [compare(target, ancestor)]: { status: 'behind' },
        [compare(ancestor, target)]: {
          status: 'ahead',
          files: [{ filename: 'scripts/ci/generate-build-metadata.ts' }],
        },
      },
    },
    'behind-stale',
  ],
  [
    'ancestor comparison reaches the GitHub file limit',
    {
      served: ancestor,
      comparisons: {
        [compare(target, ancestor)]: { status: 'behind' },
        [compare(ancestor, target)]: {
          status: 'ahead',
          files: Array(300).fill({ filename: 'docs/notes.mdx' }),
        },
      },
    },
    'behind-unprovable',
  ],
]) {
  test(`withholds authenticated proof for ${name}`, async () => {
    const { options } = world(scenario);
    await assert.rejects(
      verifyCloudflareWeb(options),
      (error) =>
        error.message === 'web-serving-unproven' &&
        error.results.some((result) => result.relation === reason)
    );
  });
}

test('a changing serving deployment can be retried under a bounded cadence', async () => {
  const { options } = world({ advance: true });
  options.env.WEB_SERVING_WAIT_SECONDS = '120';
  let time = 0;
  options.now = () => time;
  options.sleep = async (ms) => {
    assert.equal(ms, 120000);
    time += ms;
  };
  assert.equal((await verifyCloudflareWeb(options)).round, 2);
  assert.equal(time, 120000);
});

test('the default deadline stops retries after twenty minutes', async () => {
  const { options, events } = world({ split: true });
  delete options.env.WEB_SERVING_WAIT_SECONDS;
  let time = 0;
  options.now = () => time;
  options.sleep = async (ms) => {
    time += ms;
    assert.ok(time <= 1200000);
  };
  await assert.rejects(verifyCloudflareWeb(options), /web-serving-unproven/);
  assert.equal(time, 1200000);
  assert.equal(
    events.filter((path) => path === `/${family}/deployments`).length,
    11
  );
});
