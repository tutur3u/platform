import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSignedUploadHeaders,
  validateSignedUploadDestination,
} from './upload-destination.js';

describe('signed upload destination validation', () => {
  it('allows hosted Supabase upload URLs for Supabase payloads', () => {
    assert.deepEqual(
      validateSignedUploadDestination({
        provider: 'supabase',
        signedUrl:
          'https://project-ref.supabase.co/storage/v1/upload/sign/workspaces/ws-1/file.txt',
      }),
      {
        ok: true,
        signedUrl:
          'https://project-ref.supabase.co/storage/v1/upload/sign/workspaces/ws-1/file.txt',
      }
    );
  });

  it('allows hosted R2 upload URLs for R2 payloads', () => {
    assert.deepEqual(
      validateSignedUploadDestination({
        provider: 'r2',
        signedUrl:
          'https://account-id.r2.cloudflarestorage.com/bucket/ws-1/file.txt?X-Amz-Signature=test',
      }),
      {
        ok: true,
        signedUrl:
          'https://account-id.r2.cloudflarestorage.com/bucket/ws-1/file.txt?X-Amz-Signature=test',
      }
    );
  });

  it('allows exact operator-configured upload origins', () => {
    assert.deepEqual(
      validateSignedUploadDestination(
        {
          provider: 'supabase',
          signedUrl:
            'https://storage.internal.example.com/storage/v1/upload/sign/workspaces/ws-1/file.txt',
        },
        {
          allowedUploadOrigins: 'https://storage.internal.example.com',
        }
      ),
      {
        ok: true,
        signedUrl:
          'https://storage.internal.example.com/storage/v1/upload/sign/workspaces/ws-1/file.txt',
      }
    );
  });

  it('rejects missing providers and arbitrary callback-provided URLs', () => {
    assert.equal(
      validateSignedUploadDestination({
        signedUrl: 'https://project-ref.supabase.co/upload',
      }).ok,
      false
    );
    assert.equal(
      validateSignedUploadDestination({
        provider: 'supabase',
        signedUrl: 'http://169.254.169.254/latest/meta-data',
      }).ok,
      false
    );
    assert.equal(
      validateSignedUploadDestination({
        provider: 'r2',
        signedUrl: 'https://attacker.example.com/upload',
      }).ok,
      false
    );
    assert.equal(
      validateSignedUploadDestination({
        provider: 'supabase',
        signedUrl:
          'https://supabase.co/storage/v1/upload/sign/workspaces/ws-1/file.txt',
      }).ok,
      false
    );
  });

  it('allows local upload URLs only when operators explicitly opt in', () => {
    assert.equal(
      validateSignedUploadDestination({
        provider: 'supabase',
        signedUrl:
          'http://localhost:8001/storage/v1/upload/sign/workspaces/ws-1/file.txt',
      }).ok,
      false
    );
    assert.equal(
      validateSignedUploadDestination(
        {
          provider: 'supabase',
          signedUrl:
            'http://localhost:8001/storage/v1/upload/sign/workspaces/ws-1/file.txt',
        },
        {
          allowLocalUploadOrigins: true,
        }
      ).ok,
      true
    );
  });
});

describe('signed upload header filtering', () => {
  it('keeps only content type and generated bearer tokens', () => {
    assert.deepEqual(
      buildSignedUploadHeaders(
        {
          headers: {
            'Content-Type': 'text/html',
            'x-forwarded-host': 'attacker.example.com',
            'x-internal-debug': 'true',
          },
          token: ' upload-token ',
        },
        'application/octet-stream'
      ),
      {
        Authorization: 'Bearer upload-token',
        'Content-Type': 'text/html',
      }
    );
  });
});
