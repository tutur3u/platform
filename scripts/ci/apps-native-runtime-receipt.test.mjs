import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPS_ASSERTION_GROUPS,
  APPS_SUPPLIER,
} from './apps-native-runtime.mjs';
import {
  requireAppsChildOutcome,
  requireAppsReceipt,
} from './apps-native-runtime-launcher.mjs';
import { appsRoles } from './apps-native-runtime-plan.mjs';

const sourceSHA = 'a'.repeat(40);
function receipt(mode) {
  const roles = appsRoles(mode);
  return {
    schema: 1,
    mode,
    sourceSHA,
    supplier: {
      cliPath: '/supplier/cli.js',
      miniflarePath: '/supplier/mf.js',
      summary: APPS_SUPPLIER,
    },
    completed: APPS_ASSERTION_GROUPS[mode],
    errors: [],
    internalCleanup: 'UNKNOWN',
    descendantClosure: 'UNKNOWN',
    policies: Object.fromEntries(
      roles.map((role) => [
        role,
        {
          controls: 2,
          assurance: mode === 'browser' ? 0 : role === 'app' ? 4 : 1,
          permitted: mode === 'http' && role === 'app' ? 1 : 0,
          unexpected:
            role === 'negative'
              ? [
                  {
                    method: 'GET',
                    url: 'https://apps-unadmitted.invalid/api/v1/users/me/profile',
                  },
                ]
              : [],
        },
      ])
    ),
    lifecycle: {
      roles,
      phases: [
        ...roles.flatMap((role) =>
          ['acquired', 'ready'].map((phase) => ({
            role,
            phase,
            ok: true,
            error: null,
            errorIdentity: null,
          }))
        ),
        ...roles
          .slice()
          .reverse()
          .map((role) => ({
            role,
            phase: 'dispose',
            ok: true,
            error: null,
            errorIdentity: null,
          })),
      ],
      primaryIdentity: null,
      errors: [],
      internalCleanup: 'UNKNOWN',
      descendantClosure: 'UNKNOWN',
    },
  };
}
const closedOutcome = {
  code: 0,
  signal: null,
  closeObserved: true,
  stdioDrained: true,
  intervened: false,
};
test('parent requires independent natural close, every assertion group and exact finite receipt', () => {
  requireAppsChildOutcome(closedOutcome);
  for (const change of [
    { code: 1 },
    { signal: 'SIGTERM' },
    { stdioDrained: false },
    { closeObserved: false },
    { intervened: true },
    { error: new Error('output') },
  ])
    assert.throws(() =>
      requireAppsChildOutcome({ ...closedOutcome, ...change })
    );
  for (const mode of ['http', 'browser']) {
    requireAppsReceipt(receipt(mode), { sourceSHA }, mode);
    for (const mutate of [
      (r) => {
        r.sourceSHA = 'b'.repeat(40);
      },
      (r) => {
        r.completed = [];
      },
      (r) => {
        r.lifecycle.phases.pop();
      },
      (r) => {
        r.lifecycle.phases[0].ok = false;
      },
      (r) => {
        r.policies.app.controls = 0;
      },
      (r) => {
        r.supplier.summary.wranglerVersion = '4.149.0';
      },
      (r) => {
        r.lifecycle = null;
      },
      (r) => {
        delete r.supplier;
      },
    ]) {
      const candidate = structuredClone(receipt(mode));
      mutate(candidate);
      assert.throws(() => requireAppsReceipt(candidate, { sourceSHA }, mode));
    }
  }
});

test('receipt independently rejects incomplete, wrong-role and nonintegral assurance evidence', () => {
  for (const mode of ['http', 'browser']) {
    for (const role of appsRoles(mode)) {
      const expected = mode === 'browser' ? 0 : role === 'app' ? 4 : 1;
      for (const value of [
        undefined,
        null,
        -1,
        0.5,
        '1',
        expected + 1,
        expected - 1,
      ]) {
        const candidate = structuredClone(receipt(mode));
        candidate.policies[role].assurance = value;
        assert.throws(() => requireAppsReceipt(candidate, { sourceSHA }, mode));
      }
      for (const mutate of [
        (p) => {
          delete p.assurance;
        },
        (p) => {
          p.unadmitted = 1;
        },
      ]) {
        const candidate = structuredClone(receipt(mode));
        mutate(candidate.policies[role]);
        assert.throws(() => requireAppsReceipt(candidate, { sourceSHA }, mode));
      }
    }
  }
  const candidate = structuredClone(receipt('http'));
  candidate.policies.negative.permitted = 1;
  assert.throws(() => requireAppsReceipt(candidate, { sourceSHA }, 'http'));
});
