import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
            demoAccountName: 'review@tuturuuu.com',
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
