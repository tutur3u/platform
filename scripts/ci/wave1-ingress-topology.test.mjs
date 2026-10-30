import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthyTopology } from './wave1-ingress-fixture.mjs';
import {
  accessAppIds,
  evaluateIngress,
  ingressTarget,
  ingressTargets,
  isStagingWildcard,
} from './wave1-ingress-topology.mjs';

const check = (app, mutate = () => {}) => {
  const observed = healthyTopology(app);
  mutate(observed);
  return evaluateIngress(ingressTarget(app), observed);
};

test('ingress targets are exactly the Access-protected staging hosts', () => {
  assert.deepEqual(
    ingressTargets().map(({ app, host, worker, issuer }) => [
      app,
      host,
      worker,
      issuer,
    ]),
    [
      [
        'calendar',
        'calendar.staging.tutur3u.com',
        'tuturuuu-calendar-wave1-staging',
        false,
      ],
      ['web', 'web.staging.tutur3u.com', 'tuturuuu-web-wave1-staging', true],
    ]
  );
  assert.equal(ingressTarget('mail'), null);
  assert.equal(ingressTarget('apps'), null);
});

test('a healthy topology passes for both the issuer and Calendar', () => {
  assert.deepEqual(check('web'), []);
  assert.deepEqual(check('calendar'), []);
});

const failures = [
  [
    'R1 host bound to the production Worker',
    (o) => {
      o.domains.result[0].service = 'tuturuuu-calendar';
    },
    /R1/,
  ],
  [
    'R1 a second Worker on the host',
    (o) => {
      o.domains.result.push({
        hostname: 'web.staging.tutur3u.com',
        service: 'other',
        zone_name: 'tutur3u.com',
      });
    },
    /R1/,
  ],
  [
    'R1 staging Worker on an extra host',
    (o) => {
      o.domains.result.push({
        hostname: 'extra.staging.tutur3u.com',
        service: 'tuturuuu-web-wave1-staging',
        zone_name: 'tutur3u.com',
      });
    },
    /R1/,
  ],
  [
    'R1 missing Custom Domain',
    (o) => {
      o.domains.result.shift();
    },
    /R1/,
  ],
  [
    'R2 production Worker in the staging zone',
    (o) => {
      o.domains.result.push({
        hostname: 'x.staging.tutur3u.com',
        service: 'tuturuuu-mail',
        zone_name: 'tutur3u.com',
      });
    },
    /R2: production/,
  ],
  [
    'R2 capturing route',
    (o) => {
      o.routes.result.push({
        pattern: 'web.staging.tutur3u.com/api/*',
        script: 'other',
      });
    },
    /R2: route/,
  ],
  [
    'R2 wildcard route',
    (o) => {
      o.routes.result.push({ pattern: '*.staging.tutur3u.com/*' });
    },
    /R2: wildcard route/,
  ],
  [
    'N10 *.staging wildcard',
    (o) => {
      o.wildcardRecords.result.push({
        name: '*.staging.tutur3u.com',
        type: 'A',
      });
    },
    /N10/,
  ],
  [
    'N10 zone apex wildcard',
    (o) => {
      o.wildcardRecords.result.push({ name: '*.tutur3u.com', type: 'CNAME' });
    },
    /N10/,
  ],
  [
    'claimable CNAME on the host',
    (o) => {
      o.hostRecords.result = [
        {
          type: 'CNAME',
          name: 'web.staging.tutur3u.com',
          content: 'x.vercel-dns.com',
        },
      ];
    },
    /claimable CNAME/,
  ],
  [
    'missing Access application',
    (o) => {
      o.app = { success: false };
    },
    /no self-hosted Access/,
  ],
  [
    'path-only Access coverage',
    (o) => {
      o.app.result.domain = 'web.staging.tutur3u.com/login';
      o.app.result.destinations = [
        { type: 'public', uri: 'web.staging.tutur3u.com/login' },
      ];
    },
    /does not cover all/,
  ],
  [
    'Access app covering other hosts',
    (o) => {
      o.app.result.destinations.push({
        type: 'public',
        uri: 'mail.staging.tutur3u.com',
      });
    },
    /other than/,
  ],
  [
    'issuer without OPTIONS bypass',
    (o) => {
      o.app.result.options_preflight_bypass = false;
    },
    /preflight bypass must be on/,
  ],
  [
    'no staff allow policy',
    (o) => {
      o.policies.result = o.policies.result.filter(
        (p) => p.decision !== 'allow'
      );
    },
    /no staff allow/,
  ],
  [
    'an everyone include',
    (o) => {
      o.policies.result[0].include.push({ everyone: {} });
    },
    /includes everyone/,
  ],
  [
    'an unadmitted bypass policy',
    (o) => {
      o.policies.result.push({
        id: 'b',
        decision: 'bypass',
        include: [{ ip: { ip: '0.0.0.0/0' } }],
      });
    },
    /bypass policy/,
  ],
  [
    'any-valid-service-token service auth',
    (o) => {
      o.policies.result[1].include = [{ any_valid_service_token: {} }];
    },
    /must name service tokens/,
  ],
  [
    'workers.dev enabled',
    (o) => {
      o.subdomain.result.enabled = true;
    },
    /workers\.dev and preview/,
  ],
  [
    'previews enabled',
    (o) => {
      o.subdomain.result.previews_enabled = true;
    },
    /workers\.dev and preview/,
  ],
  [
    'an incomplete domain list',
    (o) => {
      o.domains.result_info.total_pages = 2;
    },
    /incomplete/,
  ],
  [
    'a failed route read',
    (o) => {
      o.routes.success = false;
    },
    /observation failed/,
  ],
];
for (const [label, mutate, message] of failures)
  test(`refuses ${label}`, () => {
    const result = check('web', mutate);
    assert.ok(
      result.some((line) => message.test(line)),
      result.join('\n')
    );
  });

test('Calendar must keep the OPTIONS preflight bypass off', () => {
  const result = check('calendar', (o) => {
    o.app.result.options_preflight_bypass = true;
  });
  assert.ok(result.some((line) => /preflight bypass must be off/.test(line)));
});

test('a Block: Everyone deny policy alone is not a staff allow (S1)', () => {
  const result = check('web', (o) => {
    o.policies.result = [
      { id: 'block', decision: 'deny', include: [{ everyone: {} }] },
    ];
  });
  assert.ok(result.some((line) => /no staff allow/.test(line)));
});

test('wildcard classification covers every name that could mint a staging host', () => {
  for (const name of [
    '*',
    '*.tutur3u.com',
    '*.staging.tutur3u.com',
    '*.x.staging.tutur3u.com',
  ])
    assert.equal(isStagingWildcard(name), true, name);
  for (const name of [
    '*.docs.tutur3u.com',
    'web.staging.tutur3u.com',
    '*.tuturuuu.com',
  ])
    assert.equal(isStagingWildcard(name), false, name);
});

test('Access application ids parse strictly', () => {
  const id = '22222222-2222-4222-8222-222222222222';
  assert.deepEqual(
    accessAppIds(JSON.stringify({ 'web.staging.tutur3u.com': id })),
    {
      'web.staging.tutur3u.com': id,
    }
  );
  for (const value of [
    undefined,
    '',
    '[]',
    'web=1',
    JSON.stringify({ 'web.tuturuuu.com': id }),
    JSON.stringify({ 'web.staging.tutur3u.com': 'x' }),
  ])
    assert.throws(() => accessAppIds(value));
});
