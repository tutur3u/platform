import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fixtureHealthTokenId,
  fixtureStaffGroupId,
  healthyTopology,
} from './wave1-ingress-fixture.mjs';

const staffEmailListId = '44444444-4444-4444-8444-444444444444';

import { evaluateIngress, ingressTarget } from './wave1-ingress-topology.mjs';

// Tess C1–C3 on the Access policy and host DNS checks (design §6.1).
const check = (app, mutate = () => {}) => {
  const observed = healthyTopology(app);
  mutate(observed);
  return evaluateIngress(ingressTarget(app), observed, {
    phase: 'staff',
    healthTokens: [fixtureHealthTokenId],
    staffGroupId: fixtureStaffGroupId,
    staffEmailListId,
  });
};

// C1: allow includes are restricted to the configured staff selector.
const allowRule = (rule) => (o) => {
  o.policies.result[0].include = [rule];
};
test('accepts only the configured staff selectors on allow policies', () => {
  for (const rule of [
    { group: { id: fixtureStaffGroupId } },
    { email: { email: 'staff@tuturuuu.com' } },
    { email_list: { id: '44444444-4444-4444-8444-444444444444' } },
    { email_domain: { domain: 'tuturuuu.com' } },
    { email_domain: { domain: 'TUTURUUU.COM' } },
  ])
    assert.deepEqual(check('web', allowRule(rule)), [], JSON.stringify(rule));
});
for (const [label, rule] of [
  [
    'another group id',
    { group: { id: '55555555-5555-4555-8555-555555555555' } },
  ],
  ['email_domain gmail.com', { email_domain: { domain: 'gmail.com' } }],
  [
    'email_domain lookalike',
    { email_domain: { domain: 'tuturuuu.com.evil.test' } },
  ],
  ['a company subdomain', { email_domain: { domain: 'staging.tuturuuu.com' } }],
  ['login_method', { login_method: { id: 'otp' } }],
  ['any_valid_service_token', { any_valid_service_token: {} }],
  ['service_token on allow', { service_token: { token_id: 't' } }],
  ['ip', { ip: { ip: '0.0.0.0/0' } }],
  ['ip_list', { ip_list: { id: 'x' } }],
  ['geo', { geo: { country_code: 'VN' } }],
  ['certificate', { certificate: {} }],
  ['common_name', { common_name: { common_name: 'x' } }],
  [
    'external_evaluation',
    { external_evaluation: { evaluate_url: 'https://x' } },
  ],
  ['auth_method', { auth_method: { auth_method: 'mfa' } }],
  ['device_posture', { device_posture: { integration_uid: 'x' } }],
  ['gsuite', { gsuite: { email: 'x', identity_provider_id: 'y' } }],
  ['an unknown type', { future_selector: { value: 'x' } }],
  [
    'a two-key rule',
    { email: { email: 'a@tuturuuu.com' }, ip: { ip: '0.0.0.0/0' } },
  ],
  ['a malformed email', { email: { email: 'not-an-email' } }],
  ['an empty rule', {}],
]) {
  test(`C1 refuses an allow include of ${label}`, () => {
    const result = check('web', allowRule(rule));
    assert.ok(
      result.some((line) => /non-staff selector/.test(line)),
      result.join('\n')
    );
  });
}
test('C1 refuses a group selector when no staff group is configured', () => {
  const result = evaluateIngress(ingressTarget('web'), healthyTopology('web'), {
    phase: 'staff',
    healthTokens: [fixtureHealthTokenId],
  });
  assert.ok(result.some((line) => /non-staff selector \(group\)/.test(line)));
});
test('C1 refuses an allow policy with no include', () => {
  const result = check('web', (o) => {
    o.policies.result[0].include = [];
  });
  assert.ok(result.some((line) => /has no staff selector/.test(line)));
});

// C2: any bypass policy on the host-wide app always fails.
for (const [label, include] of [
  ['an everyone bypass', [{ everyone: {} }]],
  ['a narrow ip bypass', [{ ip: { ip: '203.0.113.10/32' } }]],
  ['a staff-group bypass', [{ group: { id: fixtureStaffGroupId } }]],
]) {
  test(`C2 refuses ${label} on the host-wide application`, () => {
    for (const app of ['web', 'calendar']) {
      const result = check(app, (o) => {
        o.policies.result.push({
          id: 'b',
          name: 'acme',
          decision: 'bypass',
          include,
        });
      });
      assert.ok(
        result.some((line) =>
          /bypass policy acme on the host-wide application is forbidden/.test(
            line
          )
        ),
        result.join('\n')
      );
    }
  });
}

// C3: every exact-host DNS record is the proxied Worker-managed record.
const hostRecord = (patch) => (o) => {
  o.hostRecords.result = [{ ...o.hostRecords.result[0], ...patch }];
};
for (const [label, mutate] of [
  ['a grey-cloud AAAA', hostRecord({ proxied: false })],
  [
    'a grey-cloud A',
    hostRecord({ type: 'A', content: '192.0.2.1', proxied: false }),
  ],
  [
    'a user-editable proxied A',
    hostRecord({ type: 'A', content: '192.0.2.1', meta: { read_only: false } }),
  ],
  ['a record without metadata', hostRecord({ meta: undefined })],
  ['a CNAME', hostRecord({ type: 'CNAME', content: 'cname.vercel-dns.com' })],
  ['a TXT', hostRecord({ type: 'TXT', content: 'x', proxied: undefined })],
  [
    'an extra grey-cloud A beside the Worker record',
    (o) => {
      o.hostRecords.result.push({
        type: 'A',
        name: o.hostRecords.result[0].name,
        content: '192.0.2.1',
        proxied: false,
      });
    },
  ],
  [
    'a missing record',
    (o) => {
      o.hostRecords.result = [];
    },
  ],
]) {
  test(`C3 refuses ${label} on the host`, () => {
    for (const app of ['web', 'calendar']) {
      const result = check(app, mutate);
      assert.ok(
        result.some((line) => /^DNS: /.test(line)),
        result.join('\n')
      );
    }
  });
}

// P4 follow-ups: email_list is pinned; service auth names a token.
test('email_list is accepted only for the configured staff list', () => {
  assert.deepEqual(
    check('web', allowRule({ email_list: { id: staffEmailListId } })),
    []
  );
  const other = check(
    'web',
    allowRule({ email_list: { id: '66666666-6666-4666-8666-666666666666' } })
  );
  assert.ok(
    other.some((line) => /non-staff selector \(email_list\)/.test(line))
  );
  const unconfigured = evaluateIngress(
    ingressTarget('web'),
    (() => {
      const o = healthyTopology('web');
      o.policies.result[0].include = [{ email_list: { id: staffEmailListId } }];
      return o;
    })(),
    {
      phase: 'staff',
      healthTokens: [fixtureHealthTokenId],
      staffGroupId: fixtureStaffGroupId,
    }
  );
  assert.ok(
    unconfigured.some((line) => /non-staff selector \(email_list\)/.test(line))
  );
});
test('a service-auth policy with an empty include fails', () => {
  const result = check('web', (o) => {
    o.policies.result[1].include = [];
  });
  assert.ok(result.some((line) => /must name service tokens/.test(line)));
});

test('accepts company email selectors case-insensitively', () => {
  assert.deepEqual(
    check('web', allowRule({ email: { email: 'A@TUTURUUU.COM' } })),
    []
  );
});

for (const email of [
  'a@gmail.com',
  'a@evil-tuturuuu.com',
  'a@tuturuuu.com.evil',
  'a@x.tuturuuu.com',
  'a@tuturuuu.com.evil.com',
  'a@tuturuuu.cоm',
  'a@tuturuuu.com.',
]) {
  test(`refuses email outside the exact company domain: ${email}`, () => {
    const failures = check('web', allowRule({ email: { email } }));
    assert.ok(
      failures.some((failure) =>
        /staff emails must use @tuturuuu.com exactly/.test(failure)
      )
    );
  });
}
