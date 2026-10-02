import assert from 'node:assert/strict';
import test from 'node:test';
import { isTuturuuuReviewEmail } from '../../packages/utils/src/email/client.ts';
import {
  betaReviewAccessConfigured,
  distributeTestFlightBuild,
  isBetaReviewSubmissionLimit,
  storeApiErrorDiagnostic,
  submitExternalBetaReview,
} from './verify-store.mjs';

test('store API errors expose bounded codes without account details', () => {
  assert.equal(
    storeApiErrorDiagnostic({
      errors: [
        {
          code: 'ENTITY_ERROR.ATTRIBUTE.REQUIRED',
          title: 'Private account title',
          detail: 'user@example.com and a secret',
          source: { pointer: '/data/attributes/build' },
        },
      ],
    }),
    'ENTITY_ERROR.ATTRIBUTE.REQUIRED at /data/attributes/build'
  );
  assert.equal(
    storeApiErrorDiagnostic({
      errors: [
        {
          code: 'leak@example.com',
          source: { pointer: '/data/attributes/user@example.com' },
        },
      ],
    }),
    ''
  );
});

test('only the Apple beta review submission quota defers external review', async () => {
  const payload = {
    errors: [{ code: 'ENTITY_UNPROCESSABLE.SUBMISSION_LIMIT_REACHED' }],
  };
  assert.equal(
    isBetaReviewSubmissionLimit('/v1/betaAppReviewSubmissions', payload),
    true
  );
  assert.equal(isBetaReviewSubmissionLimit('/v1/builds', payload), false);
  assert.equal(
    isBetaReviewSubmissionLimit('/v1/betaAppReviewSubmissions', {
      errors: [{ code: 'ENTITY_ERROR.ATTRIBUTE.REQUIRED' }],
    }),
    false
  );

  const apple = async (path, options = {}) => {
    if (path === '/v1/apps/app/betaAppReviewDetail') {
      return {
        data: {
          attributes: {
            demoAccountRequired: true,
            demoAccountName: 'review@tutur3u.com',
            demoAccountPassword: 'configured',
            notes: 'Sign in with Email and password',
          },
        },
      };
    }
    if (path === '/v1/betaAppReviewSubmissions') {
      assert.equal(options.method, 'POST');
      const error = new Error('Apple beta review quota reached');
      error.betaReviewQuotaReached = true;
      throw error;
    }
    if (path.startsWith('/v1/betaAppReviewSubmissions?')) return { data: [] };
    if (path === '/v1/builds/new-build?include=preReleaseVersion') {
      return {
        data: {
          relationships: { preReleaseVersion: { data: { id: 'version' } } },
        },
      };
    }
    if (path.includes('betaReviewState%5D=')) return { data: [] };
    if (path.endsWith('/betaBuildLocalizations?limit=200')) {
      return { data: [{ attributes: { locale: 'en-US' } }] };
    }
    if (path.endsWith('/buildBetaDetail')) return { data: { id: 'detail' } };
    if (path === '/v1/buildBetaDetails/detail') return { data: {} };
    throw new Error(`Unexpected App Store Connect request: ${path}`);
  };
  assert.equal(
    await submitExternalBetaReview(apple, 'app', 'new-build', 'Test latest'),
    'deferred'
  );
});

const configured = {
  demoAccountRequired: true,
  demoAccountName: 'review@tutur3u.com',
  demoAccountPassword: 'synthetic-configured-value',
  notes: 'Email, password mode, personal workspace and Apps walkthrough',
};

const missingAccess = [
  ['required flag absent', 'demoAccountRequired', undefined],
  ['required flag false', 'demoAccountRequired', false],
  ['required flag is not a boolean', 'demoAccountRequired', 'true'],
  ['username absent', 'demoAccountName', undefined],
  ['username empty', 'demoAccountName', ''],
  ['username whitespace', 'demoAccountName', '  '],
  ['username invalid type', 'demoAccountName', 123],
  ['staff address', 'demoAccountName', 'review@tuturuuu.com'],
  ['staff subdomain', 'demoAccountName', 'review@xwf.tuturuuu.com'],
  ['outside domain', 'demoAccountName', 'review@example.com'],
  ['deceptive suffix', 'demoAccountName', 'review@tutur3u.com.example.com'],
  ['password absent', 'demoAccountPassword', undefined],
  ['password empty', 'demoAccountPassword', ''],
  ['password whitespace', 'demoAccountPassword', '  '],
  ['password invalid type', 'demoAccountPassword', false],
  ['notes absent', 'notes', undefined],
  ['notes empty', 'notes', ''],
  ['notes whitespace', 'notes', '  '],
  ['notes invalid type', 'notes', {}],
];

function readinessApple(attributes, calls) {
  return async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/v1/apps/app/betaAppReviewDetail') {
      return { data: { attributes } };
    }
    if (path.startsWith('/v1/betaAppReviewSubmissions?')) return { data: [] };
    if (path === '/v1/builds/build?include=preReleaseVersion') {
      return {
        data: {
          relationships: { preReleaseVersion: { data: { id: 'version' } } },
        },
      };
    }
    if (path.includes('betaReviewState%5D=')) return { data: [] };
    throw new Error('Unexpected request after metadata preflight');
  };
}

for (const [label, field, value] of missingAccess) {
  test(`external review defers without mutation: ${label}`, async () => {
    const attributes = { ...configured, [field]: value };
    const calls = [];
    assert.equal(betaReviewAccessConfigured(attributes), false);
    assert.equal(
      await submitExternalBetaReview(
        readinessApple(attributes, calls),
        'app',
        'build',
        'Test latest'
      ),
      'deferred'
    );
    assert.ok(
      calls.every(({ options }) => !options.method || options.method === 'GET')
    );
  });
}

test('reviewer address acceptance follows the provisioning domain contract', () => {
  for (const email of [
    'review@tutur3u.com',
    ' REVIEW@TUTUR3U.COM ',
    'review@tuturuuu.com',
    'review@xwf.tuturuuu.com',
    'review@example.com',
    'review@tutur3u.com.example.com',
    'review@sub.tutur3u.com',
    'bad address@tutur3u.com',
    '@tutur3u.com',
    'review@@tutur3u.com',
  ]) {
    assert.equal(
      betaReviewAccessConfigured({ ...configured, demoAccountName: email }),
      isTuturuuuReviewEmail(email),
      email
    );
  }
  assert.equal(betaReviewAccessConfigured(configured), true);
  assert.equal(betaReviewAccessConfigured(undefined), false);
});

test('metadata deferral preserves verified internal and external group assignments', async () => {
  const calls = [];
  const groups = [
    { id: 'internal', attributes: { name: 'Internal', isInternalGroup: true } },
    {
      id: 'external',
      attributes: { name: 'External', isInternalGroup: false },
    },
  ];
  const readAccess = readinessApple({ ...configured, notes: '' }, calls);
  const assigned = new Set();
  const apple = async (path, options = {}) => {
    if (path === '/v1/apps/app/betaGroups?limit=200') {
      calls.push({ path, options });
      return { data: groups };
    }
    if (path === '/v1/builds/build/relationships/betaGroups') {
      calls.push({ path, options });
      assert.equal(options.method, 'POST');
      for (const group of JSON.parse(options.body).data) assigned.add(group.id);
      return {};
    }
    if (path === '/v1/builds/build?include=betaGroups') {
      calls.push({ path, options });
      return {
        data: {
          relationships: {
            betaGroups: { data: [...assigned].map((id) => ({ id })) },
          },
        },
      };
    }
    return readAccess(path, options);
  };
  assert.deepEqual(
    await distributeTestFlightBuild(apple, 'app', 'build', {
      enabled: 'true',
      groups: 'all',
      whatsNew: 'Test latest',
    }),
    groups
  );
  const metadataRead = calls.findIndex(
    ({ path }) => path === '/v1/apps/app/betaAppReviewDetail'
  );
  const lastAssignment = calls.findLastIndex(
    ({ options }) => options.method === 'POST'
  );
  assert.ok(metadataRead > lastAssignment);
  assert.ok(
    calls
      .slice(lastAssignment + 1, metadataRead)
      .some(({ path }) => path === '/v1/builds/build?include=betaGroups')
  );
  assert.deepEqual([...assigned].sort(), ['external', 'internal']);
  const writes = calls.filter(({ options }) => options.method === 'POST');
  assert.equal(writes.length, 2);
  assert.ok(
    writes.every(
      ({ path }) => path === '/v1/builds/build/relationships/betaGroups'
    )
  );
  assert.ok(
    writes.some(
      ({ options }) => JSON.parse(options.body).data[0].id === 'internal'
    )
  );
});
