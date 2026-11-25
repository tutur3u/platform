import assert from 'node:assert/strict';
import test from 'node:test';
import { storeApiErrorDiagnostic } from './store-api-diagnostic.mjs';
import { storeApiErrorDiagnostic as reexported } from './verify-store.mjs';

test('verify-store keeps exporting the diagnostic', () => {
  assert.equal(reexported, storeApiErrorDiagnostic);
});

test('store diagnostics keep bounded Google codes, reasons, fields and redacted messages', () => {
  assert.equal(
    storeApiErrorDiagnostic({
      error: {
        code: 400,
        status: 'FAILED_PRECONDITION',
        message: 'Changes for owner@example.com cannot be sent for review.',
        errors: [{ reason: 'changesNotSentForReview', message: 'private' }],
        details: [
          {
            reason: 'changesNotSentForReview',
            metadata: { private: 'Private metadata' },
            violations: [
              {
                field: 'releases[0].releaseNotes[0].language',
                description: 'Private description',
              },
              { field: 'com.example.private' },
            ],
          },
          { reason: 'has spaces and private data' },
        ],
      },
    }),
    'FAILED_PRECONDITION, 400, changesNotSentForReview, releases[0].releaseNotes[0].language, Changes for [redacted] cannot be sent for review.'
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

test('Google messages mask identifiers and omit redaction-only summaries', () => {
  assert.equal(
    storeApiErrorDiagnostic({
      error: {
        message:
          'Review blocked for com.example.private at https://example.test/a, owner@example.test, 123456789012, abcdef0123456789, QWxwaGFCZXRhR2FtbWFEZWx0YQ==, token=shortValue.',
      },
    }),
    'Review blocked for [redacted] at [redacted] [redacted], [redacted], [redacted], [redacted], [redacted]'
  );
  assert.equal(
    storeApiErrorDiagnostic({ error: { message: 'owner@example.test' } }),
    ''
  );
  assert.equal(
    storeApiErrorDiagnostic({
      error: { message: 'Review blocked. '.repeat(20) },
    }).length,
    200
  );
});
