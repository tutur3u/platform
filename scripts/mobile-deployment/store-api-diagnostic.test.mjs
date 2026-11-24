import assert from 'node:assert/strict';
import test from 'node:test';
import { storeApiErrorDiagnostic } from './store-api-diagnostic.mjs';
import { storeApiErrorDiagnostic as reexported } from './verify-store.mjs';

test('verify-store keeps exporting the diagnostic', () => {
  assert.equal(reexported, storeApiErrorDiagnostic);
});

test('store diagnostics keep only enum-like Google API status and reasons', () => {
  assert.equal(
    storeApiErrorDiagnostic({
      error: {
        code: 400,
        status: 'FAILED_PRECONDITION',
        message: 'Changes for owner@example.com cannot be sent for review.',
        errors: [{ reason: 'changesNotSentForReview', message: 'private' }],
        details: [
          { reason: 'changesNotSentForReview' },
          { reason: 'has spaces and private data' },
        ],
      },
    }),
    'FAILED_PRECONDITION, changesNotSentForReview'
  );
  assert.equal(
    storeApiErrorDiagnostic({ error: 'private provider diagnostics' }),
    ''
  );
  assert.equal(
    storeApiErrorDiagnostic({ errors: [{ code: 'ENTITY_ERROR' }] }),
    'ENTITY_ERROR'
  );
});
