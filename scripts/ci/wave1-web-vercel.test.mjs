import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANONYMOUS_PATHS,
  deploymentHosts,
  evaluateDeployment,
  evaluateProtection,
  originProof,
  vercelProbes,
} from './wave1-web-vercel.mjs';

const bypass = 'b'.repeat(32);
const sha = 'f'.repeat(40);
const healthyProject = () => ({
  ssoProtection: { deploymentType: 'all' },
  passwordProtection: null,
  trustedIps: null,
  optionsAllowlist: null,
  protectionBypass: { [bypass]: { scope: 'automation-bypass' } },
});

test('V1b accepts all-deployment protection with exactly one matching bypass', () => {
  assert.deepEqual(evaluateProtection(healthyProject(), bypass), []);
});
for (const [label, mutate, message] of [
  [
    'previews-only protection',
    (p) => {
      p.ssoProtection.deploymentType = 'preview';
    },
    /ALL deployments/,
  ],
  [
    'standard (custom domains exempt)',
    (p) => {
      p.ssoProtection.deploymentType = 'all_except_custom_domains';
    },
    /ALL deployments/,
  ],
  [
    'no protection',
    (p) => {
      p.ssoProtection = null;
    },
    /ALL deployments/,
  ],
  [
    'password protection',
    (p) => {
      p.passwordProtection = { deploymentType: 'all' };
    },
    /password/,
  ],
  [
    'trusted IPs',
    (p) => {
      p.trustedIps = { addresses: [] };
    },
    /trusted IPs/,
  ],
  [
    'an OPTIONS allowlist',
    (p) => {
      p.optionsAllowlist = { paths: [] };
    },
    /OPTIONS allowlist/,
  ],
  [
    'a shareable link',
    (p) => {
      p.protectionBypass.x = { scope: 'shareable-link' };
    },
    /shareable links/,
  ],
  [
    'two automation secrets',
    (p) => {
      p.protectionBypass[`${'c'.repeat(32)}`] = { scope: 'automation-bypass' };
    },
    /exactly one/,
  ],
  [
    'no automation secret',
    (p) => {
      p.protectionBypass = {};
    },
    /exactly one/,
  ],
  [
    'a different automation secret',
    (p) => {
      p.protectionBypass = { ['c'.repeat(32)]: { scope: 'automation-bypass' } };
    },
    /differs from the Worker secret/,
  ],
]) {
  test(`V1b refuses ${label}`, () => {
    const project = healthyProject();
    mutate(project);
    const failures = evaluateProtection(project, bypass);
    assert.ok(
      failures.some((f) => message.test(f)),
      failures.join('\n')
    );
    assert.ok(!failures.join('').includes(bypass), 'never echoes the secret');
  });
}

test('deployment readback binds id, project, READY, non-production target, SHA and URL', () => {
  const good = {
    id: 'dpl_fixture0001',
    projectId: 'prj_x',
    readyState: 'READY',
    target: 'staging',
    meta: { githubCommitSha: sha },
    url: 'tuturuuu-web-staging-abc.vercel.app',
  };
  const expect = { projectId: 'prj_x', sha, deploymentId: 'dpl_fixture0001' };
  assert.deepEqual(evaluateDeployment(good, expect), []);
  for (const patch of [
    { id: 'dpl_other0001' },
    { projectId: 'prj_y' },
    { readyState: 'BUILDING' },
    { target: 'production' },
    { meta: { githubCommitSha: '0'.repeat(40) } },
    { url: 'tuturuuu.vercel.app' },
  ])
    assert.ok(
      evaluateDeployment({ ...good, ...patch }, expect).length > 0,
      JSON.stringify(patch)
    );
});

test('every alias and project domain is enumerated; custom domains fail', () => {
  const deployment = {
    url: 'tuturuuu-web-staging-abc.vercel.app',
    alias: ['tuturuuu-web-staging-project.vercel.app'],
  };
  const { hosts, failures } = deploymentHosts({
    deployment,
    aliases: {
      aliases: [{ alias: 'tuturuuu-web-staging-git-main.vercel.app' }],
    },
    domains: { domains: [{ name: 'tuturuuu-web-staging-project.vercel.app' }] },
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(hosts, [
    'tuturuuu-web-staging-abc.vercel.app',
    'tuturuuu-web-staging-git-main.vercel.app',
    'tuturuuu-web-staging-project.vercel.app',
  ]);
  assert.ok(
    deploymentHosts({
      deployment,
      aliases: { aliases: [] },
      domains: { domains: [{ name: 'web.example.com' }] },
    }).failures.some((f) => /custom domain/.test(f))
  );
  assert.ok(
    deploymentHosts({
      deployment,
      aliases: {
        aliases: Array.from({ length: 100 }, (_, i) => ({
          alias: `a${i}.vercel.app`,
        })),
      },
      domains: { domains: [] },
    }).failures.some((f) => /incomplete/.test(f))
  );
});

test('the inline origin proof matches @tuturuuu/utils origin-ip-proof', () => {
  assert.equal(
    originProof('p'.repeat(40), '203.0.113.10', 1900000000),
    'hmac-v1;1900000000;203.0.113.10;2cf701417616f79fda42b9a02fe7274f6668ebbe6ae9be0fd6020192f43be033'
  );
});

function fixture({ open, unprotectedProof, jwtCookie, noAttestation } = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const u = new URL(url);
    const headers = new Headers(init.headers);
    calls.push({
      path: `${u.pathname}${u.search}`,
      host: u.hostname,
      bypass: headers.has('x-vercel-protection-bypass'),
      proof: headers.has('x-tuturuuu-origin-auth'),
    });
    assert.equal(init.redirect, 'manual');
    assert.ok(
      !headers.has('x-vercel-set-bypass-cookie'),
      'never asks for a bypass cookie'
    );
    if (open?.(u)) return new Response('open');
    const cookie = jwtCookie ? { 'set-cookie': '_vercel_jwt=x; Path=/' } : {};
    if (!headers.has('x-vercel-protection-bypass'))
      return new Response(null, {
        status: 302,
        headers: { location: 'https://vercel.com/sso-api?url=x', ...cookie },
      });
    if (!headers.has('x-tuturuuu-origin-auth'))
      return new Response('', {
        status: unprotectedProof ? 200 : 403,
        headers: cookie,
      });
    return new Response('login', {
      headers: noAttestation
        ? {}
        : { 'x-tuturuuu-staging-supabase-ref': 'fxefojytwimjiqxseqag' },
    });
  };
  return { fetcher, calls };
}
const hosts = [
  'tuturuuu-web-staging-abc.vercel.app',
  'tuturuuu-web-staging-git-main.vercel.app',
];

test('probes are green when every host denies anonymously and gates proof-less bypass', async () => {
  const { fetcher, calls } = fixture();
  const checks = await vercelProbes({
    hosts,
    fetcher,
    bypassSecret: bypass,
    proofSecret: 'p'.repeat(40),
  });
  assert.deepEqual(
    checks.filter((c) => !c.ok),
    []
  );
  for (const host of hosts)
    for (const path of ANONYMOUS_PATHS)
      assert.ok(
        calls.some((c) => c.host === host && c.path === path && !c.bypass),
        `${host}${path}`
      );
  assert.ok(
    ANONYMOUS_PATHS.some((p) => p.startsWith('/_next/image')) &&
      ANONYMOUS_PATHS.includes('/monitoring')
  );
});
for (const [label, options, id] of [
  [
    'an open image optimizer on an alias',
    {
      open: (u) =>
        u.hostname.includes('git-main') && u.pathname === '/_next/image',
    },
    'N16',
  ],
  [
    'an open monitoring tunnel',
    { open: (u) => u.pathname === '/monitoring' },
    'N16',
  ],
  [
    'an open root on the deployment URL',
    { open: (u) => u.pathname === '/' && !u.hostname.includes('git') },
    'N16',
  ],
  ['bypass without origin proof served', { unprotectedProof: true }, 'N15'],
  ['a minted _vercel_jwt', { jwtCookie: true }, 'N17'],
  ['a missing attestation', { noAttestation: true }, 'attestation'],
]) {
  test(`probes fail on ${label}`, async () => {
    const { fetcher } = fixture(options);
    const checks = await vercelProbes({
      hosts,
      fetcher,
      bypassSecret: bypass,
      proofSecret: 'p'.repeat(40),
    });
    assert.ok(
      checks.some((c) => c.id === id && !c.ok),
      id
    );
  });
}

for (const value of [
  'tuturuuu-web-staging-x.vercel.app.evil.com',
  'https://user@tuturuuu-web-staging-x.vercel.app',
  'https://tuturuuu-web-staging-x.vercel.app:8443',
  'https://tuturuuu-web-staging-x.vercel.app:443',
  'web.example.com',
  'other.vercel.app',
  '',
]) {
  test(`refuses invalid staging origin ${value || '(empty)'} before fetching`, async () => {
    const { fetcher, calls } = fixture();
    await assert.rejects(
      vercelProbes({
        hosts: [...hosts, value],
        fetcher,
        bypassSecret: bypass,
        proofSecret: 'p'.repeat(40),
      }),
      /allowed staging hosts/
    );
    assert.deepEqual(calls, []);
    const result = deploymentHosts({
      deployment: { url: hosts[0] },
      aliases: { aliases: [{ alias: value }] },
      domains: { domains: [] },
    });
    assert.ok(result.failures.length);
    assert.deepEqual(result.hosts, [hosts[0]]);
  });
}

test('requires at least one allowed staging host', async () => {
  const { fetcher, calls } = fixture();
  await assert.rejects(
    vercelProbes({ hosts: [], fetcher, bypassSecret: bypass }),
    /allowed staging hosts/
  );
  assert.deepEqual(calls, []);
});

test('normalizes staging hosts and chooses the same proof host in any order', async () => {
  for (const order of [
    hosts,
    [...hosts].reverse(),
    hosts.map((h) => `https://${h.toUpperCase()}`),
  ]) {
    const { fetcher, calls } = fixture();
    await vercelProbes({
      hosts: order,
      fetcher,
      bypassSecret: bypass,
      proofSecret: 'p'.repeat(40),
    });
    assert.ok(calls.filter((c) => c.bypass).length);
    assert.ok(
      calls.filter((c) => c.bypass).every((c) => hosts.includes(c.host))
    );
    assert.deepEqual(
      calls.filter((c) => c.proof).map((c) => c.host),
      [hosts[0]]
    );
  }
});
